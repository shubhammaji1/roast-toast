import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import type { Auth } from "../apps/api/src/auth";
import { createApp } from "../apps/api/src/app";
import {
  normalizeAnalyticsIp,
  isPublicAnalyticsIp,
} from "../apps/api/src/analytics";
import { query, migrateDatabase } from "../apps/api/src/database";
import { testDatabase } from "./postgres";

let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createApp>>;
const lookup = vi.fn();
const origin = "http://localhost:3000";
const auth = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) =>
      headers.get("authorization") === "Bearer analytics-admin"
        ? {
            user: {
              id: "analytics-admin",
              name: "Analytics admin",
              email: "analytics@example.test",
              emailVerified: true,
            },
            session: { createdAt: new Date() },
          }
        : null,
  },
  handler: async () => new Response("", { status: 404 }),
} as unknown as Auth;
const admin = () =>
  request(app)
    .get("/api/v1/admin/analytics")
    .set("Authorization", "Bearer analytics-admin");
const beat = (ip = "8.8.8.8") =>
  request(app)
    .post("/api/v1/analytics/heartbeat")
    .set("Origin", origin)
    .set("X-Forwarded-For", ip)
    .send({ path: "/explore" });

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("ADMIN_EMAILS", "analytics@example.test");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("TRUST_PROXY", "0");
  vi.stubEnv("IPAPI_ENABLED", "1");
  vi.stubEnv("IPAPI_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  database = await testDatabase();
  app = await createApp(auth);
});
beforeEach(async () => {
  await query("DELETE FROM public.analytics_visits");
  await query("DELETE FROM public.analytics_ip_locations");
  await query(
    "UPDATE public.analytics_totals SET total_visitors = 0 WHERE id = 1",
  );
  app.set("trust proxy", 1); // Test fixture explicitly simulates a trusted, header-replacing ingress.
  vi.stubEnv("IPAPI_KEY", "test-only-ipapi-key");
  vi.stubEnv("IPAPI_ENABLED", "1");
  lookup.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({
      ip: "8.8.8.8",
      city: "Mountain View",
      region_name: "California",
      country_name: "United States",
      country_code: "US",
    }),
  });
  vi.stubGlobal("fetch", lookup);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await database?.close();
  vi.unstubAllEnvs();
});

it("applies all idempotent migrations, keeps analytics private and rejects non-admin detail access", async () => {
  await migrateDatabase();
  const tables = await query(
    "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('analytics_visits', 'analytics_ip_locations', 'analytics_totals') ORDER BY relname",
  );
  expect(tables.rows).toHaveLength(3);
  expect(tables.rows.every((table) => table.relrowsecurity)).toBe(true);
  expect((await request(app).get("/api/v1/admin/analytics")).status).toBe(401);
  const member = request.agent(app);
  await member.get("/api/v1/visitor-session");
  const forbidden = await member.get("/api/v1/admin/analytics");
  expect(forbidden.status).toBe(403);
  expect(forbidden.headers["cache-control"]).toBe("no-store");
  const publicCount = await request(app).get("/api/v1/analytics/online");
  expect(publicCount.body).toEqual({
    online: 0,
    totalVisitors: 0,
    activeWindowSeconds: 120,
  });
  expect(publicCount.headers["cache-control"]).toBe("no-store");
});

it("accepts a browser's canonical Origin when APP_ORIGIN has a trailing slash while rejecting non-origin request headers", async () => {
  const original = process.env.APP_ORIGIN;
  vi.stubEnv("APP_ORIGIN", `${origin}/`);
  try {
    const trailingSlashApp = await createApp(auth);
    const heartbeat = await request(trailingSlashApp)
      .post("/api/v1/analytics/heartbeat")
      .set("Origin", origin)
      .send({ path: "/" });
    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.online).toBe(1);
    expect((await request(trailingSlashApp).get("/api/v1")).body.baseUrl).toBe(
      `${origin}/api/v1`,
    );
    for (const invalidOrigin of [
      "https://evil.test",
      `${origin}/`,
      `${origin}/some-path`,
    ]) {
      expect(
        (
          await request(trailingSlashApp)
            .post("/api/v1/analytics/heartbeat")
            .set("Origin", invalidOrigin)
            .send({ path: "/" })
        ).status,
      ).toBe(403);
    }
  } finally {
    vi.stubEnv("APP_ORIGIN", original);
  }
});

it("deduplicates tabs by a private browser cookie, counts separate browsers on one IP and caches locations", async () => {
  const initial = await request(app).get("/api/v1/visitor-session");
  expect(
    initial.headers["set-cookie"].some((value: string) =>
      value.startsWith("rt-analytics="),
    ),
  ).toBe(true);
  expect(
    (await query("SELECT id FROM public.analytics_visits")).rows,
  ).toHaveLength(0);
  const profileCount = (await query("SELECT id FROM public.profiles")).rows
    .length;
  const initialCookie = initial.headers["set-cookie"]
    .find((value: string) => value.startsWith("rt-analytics="))!
    .split(";")[0];
  const first = await beat().set("Cookie", initialCookie);
  expect(first.status).toBe(200);
  expect(first.body).toEqual({
    online: 1,
    totalVisitors: 1,
    activeWindowSeconds: 120,
  });
  const setCookie = first.headers["set-cookie"][0];
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Lax");
  const cookie = setCookie.split(";")[0];
  expect((await beat().set("Cookie", cookie)).body).toMatchObject({
    online: 1,
    totalVisitors: 1,
  });
  expect((await beat().set("Cookie", cookie)).body).toMatchObject({
    online: 1,
    totalVisitors: 1,
  });
  expect((await beat()).body).toMatchObject({ online: 2, totalVisitors: 2 });
  expect(lookup).toHaveBeenCalledTimes(1);
  const requestUrl = new URL(String(lookup.mock.calls[0][0]));
  expect(requestUrl.origin).toBe("https://api.ipapi.com");
  expect(requestUrl.pathname).toBe("/api/8.8.8.8");
  expect(requestUrl.searchParams.get("access_key")).toBe("test-only-ipapi-key");
  expect(requestUrl.searchParams.has("key")).toBe(false);
  expect(requestUrl.searchParams.get("fields")).toBe(
    "ip,city,region_name,country_name,country_code",
  );
  expect(lookup.mock.calls[0][1].redirect).toBe("error");
  const stored = await query(
    "SELECT host(ip) AS ip FROM public.analytics_visits",
  );
  expect(stored.rows).toHaveLength(2);
  expect(stored.rows[0].ip).toBe("8.8.8.8");
  expect((await query("SELECT id FROM public.profiles")).rows).toHaveLength(
    profileCount,
  );
  const summary = await admin();
  expect(summary.status).toBe(200);
  expect(summary.body).toMatchObject({
    online: 2,
    totalVisitors: 2,
    visitorsToday: 2,
    visitors30d: 2,
    windowDays: 30,
  });
  expect(summary.body.topLocations).toEqual([
    {
      city: "Mountain View",
      region: "California",
      country: "United States",
      countryCode: "US",
      visitors: 2,
    },
  ]);
  expect(summary.body.recentVisitors[0]).toMatchObject({
    ip: "8.8.8.8",
    path: "/explore",
    city: "Mountain View",
  });
  expect(summary.headers["cache-control"]).toBe("no-store");
});

it("expires online presence after two minutes while preserving daily visitors and excludes old records", async () => {
  await beat();
  await query(
    "UPDATE public.analytics_visits SET last_seen = now() - interval '3 minutes'",
  );
  expect((await request(app).get("/api/v1/analytics/online")).body.online).toBe(
    0,
  );
  expect((await admin()).body).toMatchObject({
    visitorsToday: 1,
    visitors30d: 1,
  });
  await query(
    "UPDATE public.analytics_visits SET last_seen = now() - interval '31 days'",
  );
  const expired = await admin();
  expect(expired.body).toMatchObject({
    online: 0,
    totalVisitors: 1,
    visitorsToday: 0,
    visitors30d: 0,
    topLocations: [],
    recentVisitors: [],
  });
  const cleanupApp = await createApp(auth);
  await request(cleanupApp)
    .post("/api/v1/analytics/heartbeat")
    .send({ path: "/" });
  expect(
    (
      await query(
        "SELECT id FROM public.analytics_visits WHERE last_seen < now() - interval '30 days'",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await request(app).get("/api/v1/analytics/online")).body.totalVisitors,
  ).toBe(2);
});

it("counts a browser once across different days and changing IP addresses", async () => {
  const first = await beat();
  const cookie = first.headers["set-cookie"][0].split(";")[0];
  await query(
    "UPDATE public.analytics_visits SET id = $1, visit_day = current_date - 1, first_seen = now() - interval '1 day', last_seen = now() - interval '1 day'",
    ["a".repeat(64)],
  );
  expect((await beat().set("Cookie", cookie)).body.totalVisitors).toBe(1);
  expect((await beat("1.1.1.1").set("Cookie", cookie)).body.totalVisitors).toBe(
    1,
  );
  expect(
    (await query("SELECT id FROM public.analytics_visits")).rows,
  ).toHaveLength(3);
  expect((await admin()).body).toMatchObject({
    totalVisitors: 1,
    visitors30d: 1,
  });
});

it("increments cumulative visitors once for concurrent first heartbeats with the same browser cookie", async () => {
  const cookie = `rt-analytics=${"b".repeat(64)}`;
  const results = await Promise.all(
    Array.from({ length: 5 }, () => beat().set("Cookie", cookie)),
  );
  expect(results.every((result) => result.status === 200)).toBe(true);
  expect(results.every((result) => result.body.totalVisitors === 1)).toBe(true);
  expect((await request(app).get("/api/v1/analytics/online")).body).toEqual({
    online: 1,
    totalVisitors: 1,
    activeWindowSeconds: 120,
  });
  const separateBrowsers = await Promise.all(
    Array.from({ length: 3 }, () => beat()),
  );
  expect(separateBrowsers.every((result) => result.status === 200)).toBe(true);
  expect(
    (await request(app).get("/api/v1/analytics/online")).body,
  ).toMatchObject({ online: 4, totalVisitors: 4 });
});

it("rolls back a first visit when its cumulative count cannot be saved", async () => {
  await query(`CREATE FUNCTION pg_temp.reject_analytics_count() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Test cumulative count failure'; END; $$`);
  await query(
    "CREATE TRIGGER reject_analytics_count BEFORE UPDATE ON public.analytics_totals FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_analytics_count()",
  );
  const expectedError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await beat()).status).toBe(500);
    expect(
      (await query("SELECT id FROM public.analytics_visits")).rows,
    ).toHaveLength(0);
    expect(
      (await request(app).get("/api/v1/analytics/online")).body,
    ).toMatchObject({ online: 0, totalVisitors: 0 });
  } finally {
    await query(
      "DROP TRIGGER reject_analytics_count ON public.analytics_totals",
    );
    expectedError.mockRestore();
  }
});

it("backfills cumulative visitors from distinct retained browsers once without counting daily or IP records twice", async () => {
  const first = await beat();
  const cookie = first.headers["set-cookie"][0].split(";")[0];
  await beat("1.1.1.1").set("Cookie", cookie);
  await beat();
  await query("DELETE FROM public.analytics_totals");
  await migrateDatabase();
  expect(
    (await request(app).get("/api/v1/analytics/online")).body.totalVisitors,
  ).toBe(2);
  await query("UPDATE public.analytics_totals SET total_visitors = 10");
  await migrateDatabase();
  expect(
    (await request(app).get("/api/v1/analytics/online")).body.totalVisitors,
  ).toBe(10);
  const columns = await query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_totals' ORDER BY ordinal_position",
  );
  expect(columns.rows.map((row) => row.column_name)).toEqual([
    "id",
    "total_visitors",
  ]);
});

it("ignores untrusted forwarded IPs and skips private/local geolocation", async () => {
  app.set("trust proxy", false);
  expect((await beat("1.1.1.1")).status).toBe(200);
  expect(lookup).not.toHaveBeenCalled();
  expect((await admin()).body.recentVisitors[0]).toMatchObject({
    ip: "127.0.0.1",
    country: "",
  });
  app.set("trust proxy", 1);
  expect((await beat("10.4.5.6")).status).toBe(200);
  expect(lookup).not.toHaveBeenCalled();
  expect(normalizeAnalyticsIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
  expect(normalizeAnalyticsIp("1.2.3.4, 9.9.9.9")).toBeNull();
  for (const ip of [
    "127.0.0.1",
    "192.168.1.3",
    "100.64.0.1",
    "::1",
    "fc00::2",
    "2001:db8::1",
  ])
    expect(isPublicAnalyticsIp(ip), ip).toBe(false);
  expect(isPublicAnalyticsIp("2001:4860:4860::8888")).toBe(true);
});

it("records unknown locations during provider failures, caches failures, and rejects query strings and cross-site writes", async () => {
  lookup.mockRejectedValue(new Error("provider unavailable"));
  const first = await beat();
  expect(first.status).toBe(200);
  expect((await beat()).status).toBe(200);
  expect(lookup).toHaveBeenCalledOnce();
  expect((await admin()).body.topLocations).toEqual([
    { city: "", region: "", country: "", countryCode: "", visitors: 2 },
  ]);
  const invalid = await request(app)
    .post("/api/v1/analytics/heartbeat")
    .send({ path: "/reset-password?token=secret" });
  expect(invalid.status).toBe(400);
  expect(
    (
      await request(app)
        .post("/api/v1/analytics/heartbeat")
        .set("Origin", "https://evil.test")
        .send({ path: "/" })
    ).status,
  ).toBe(403);
  const claimedIp = await request(app)
    .post("/api/v1/analytics/heartbeat")
    .send({ path: "/", ip: "1.1.1.1", country: "India" });
  expect(claimedIp.status).toBe(400);
  expect(claimedIp.headers["cache-control"]).toBe("no-store");
});

it.each([
  [101, "invalid_access_key"],
  [104, "usage_limit_reached"],
  [105, "https_access_restricted"],
])(
  "keeps visits and caches ipapi.com provider error %i (%s) without retrying over HTTP",
  async (code, type) => {
    lookup.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        error: { code, type, info: "Provider rejected the lookup." },
      }),
    });
    expect((await beat()).status).toBe(200);
    expect((await beat()).status).toBe(200);
    expect(lookup).toHaveBeenCalledOnce();
    expect(new URL(String(lookup.mock.calls[0][0])).protocol).toBe("https:");
    expect((await admin()).body).toMatchObject({ online: 2, visitors30d: 2 });
    expect((await admin()).body.recentVisitors[0].country).toBe("");
    const cached = await query(
      "SELECT expires_at > now() AND expires_at < now() + interval '16 minutes' AS short_lived FROM public.analytics_ip_locations",
    );
    expect(cached.rows[0].short_lived).toBe(true);
  },
);

it.each(["", "   "])(
  "keeps visitor counts without contacting a provider when IPAPI_KEY is blank (%j)",
  async (key) => {
    vi.stubEnv("IPAPI_KEY", key);
    expect((await beat()).body.online).toBe(1);
    expect(lookup).not.toHaveBeenCalled();
    expect((await admin()).body.recentVisitors[0]).toMatchObject({
      ip: "8.8.8.8",
      country: "",
    });
  },
);

it.each([
  null,
  [],
  {},
  { ip: "invalid", country_name: "United States", country_code: "US" },
  {
    ip: "8.8.8.8",
    country_name: "United States",
    country_code: { invalid: true },
  },
  {
    ip: "8.8.8.8",
    country_name: "United States",
    country_code: "US",
    region_name: 123,
  },
])(
  "treats malformed ipapi.com response %j as an unknown location without losing visits",
  async (body) => {
    lookup.mockResolvedValue({ ok: true, json: async () => body });
    expect((await beat()).status).toBe(200);
    expect((await admin()).body).toMatchObject({ online: 1, visitors30d: 1 });
    expect((await admin()).body.recentVisitors[0].country).toBe("");
  },
);

it("keeps visits if ipapi.com returns a failed HTTP response", async () => {
  const parse = vi.fn();
  lookup.mockResolvedValue({ ok: false, status: 429, json: parse });
  expect((await beat()).status).toBe(200);
  expect(parse).not.toHaveBeenCalled();
  expect((await admin()).body.recentVisitors[0].country).toBe("");
});

it("deletes this browser's activity and analytics cookie when its workspace data is deleted", async () => {
  const guest = request.agent(app);
  await guest.post("/api/v1/analytics/heartbeat").send({ path: "/" });
  await guest.get("/api/v1/visitor-session");
  const deleted = await guest
    .delete("/api/v1/my-data")
    .send({ confirmation: "DELETE MY DATA" });
  expect(deleted.status).toBe(200);
  expect(
    deleted.headers["set-cookie"].some(
      (value: string) =>
        value.startsWith("rt-analytics=;") &&
        value.includes("Expires=Thu, 01 Jan 1970"),
    ),
  ).toBe(true);
  expect((await admin()).body).toMatchObject({
    visitors30d: 0,
    totalVisitors: 1,
    recentVisitors: [],
  });
});

it("documents public tracking without an account-session requirement", async () => {
  const spec = await request(app).get("/api/v1/openapi.json");
  expect(spec.body.paths["/api/v1/analytics/heartbeat"].post.security).toEqual(
    [],
  );
  expect(spec.body.paths["/api/v1/analytics/online"].get.security).toEqual([]);
  expect(
    spec.body.paths["/api/v1/admin/analytics"].get.security.length,
  ).toBeGreaterThan(0);
});
