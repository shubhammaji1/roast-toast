import type { Express, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { isIP, BlockList } from "node:net";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { query } from "./database.js";
import { sharedRateStore } from "./infrastructure.js";

export const activeWindowSeconds = 120;
export const analyticsWindowDays = 30;
const dayMs = 86400000;
const emptyLocation = { city: "", region: "", country: "", countryCode: "" };
type Location = typeof emptyLocation;
const privateNetworks = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  privateNetworks.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const)
  privateNetworks.addSubnet(address, prefix, "ipv6");

export function normalizeAnalyticsIp(value: string | undefined) {
  if (!value) return null;
  const ip =
    value.startsWith("::ffff:") && isIP(value.slice(7)) === 4
      ? value.slice(7)
      : value;
  return isIP(ip) ? ip : null;
}
export function isPublicAnalyticsIp(ip: string) {
  const family = isIP(ip);
  return (
    family !== 0 && !privateNetworks.check(ip, family === 4 ? "ipv4" : "ipv6")
  );
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function cookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Host-rt-analytics"
    : "rt-analytics";
}
function cookieAttributes() {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      process.env.APP_ORIGIN?.startsWith("https://") === true,
    sameSite: "lax" as const,
    path: "/",
  };
}
export function ensureAnalyticsCookie(req: Request, res: Response): string {
  const current = req.cookies?.[cookieName()];
  const token =
    typeof current === "string" && /^[a-f0-9]{64}$/.test(current)
      ? current
      : randomBytes(32).toString("hex");
  res.cookie(cookieName(), token, {
    ...cookieAttributes(),
    maxAge: analyticsWindowDays * dayMs,
  });
  return token;
}
const textField = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 100) : "";
const locationFromRow = (row: any): Location => ({
  city: row.city,
  region: row.region,
  country: row.country,
  countryCode: row.country_code,
});
const ipapiLocationSchema = z.object({
  ip: z.string().refine((ip) => isIP(ip) !== 0),
  city: z.string().nullable().optional(),
  region_name: z.string().nullable().optional(),
  country_name: z.string().trim().min(1),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  success: z.literal(true).optional(),
  error: z.never().optional(),
});

// Concurrency is bounded, and the database cache is shared by all API instances.
const pendingLocations = new Map<string, Promise<Location>>();
async function locationForIp(ip: string): Promise<Location> {
  const accessKey = process.env.IPAPI_KEY?.trim();
  if (
    process.env.IPAPI_ENABLED === "0" ||
    !accessKey ||
    !isPublicAnalyticsIp(ip)
  )
    return emptyLocation;
  const cached = await query(
    "SELECT * FROM public.analytics_ip_locations WHERE ip = $1::inet AND expires_at > now()",
    [ip],
  );
  if (cached.rows[0]) return locationFromRow(cached.rows[0]);
  const pending = pendingLocations.get(ip);
  if (pending) return pending;
  if (pendingLocations.size >= 8) return emptyLocation;
  const lookup = (async () => {
    let location = emptyLocation;
    let success = false;
    try {
      const url = new URL(
        `https://api.ipapi.com/api/${encodeURIComponent(ip)}`,
      );
      url.searchParams.set("access_key", accessKey);
      url.searchParams.set(
        "fields",
        "ip,city,region_name,country_name,country_code",
      );
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2500),
        redirect: "error",
        headers: {
          Accept: "application/json",
          "User-Agent": "RoastAndToast/1.0",
        },
      });
      if (response.ok) {
        const parsed = ipapiLocationSchema.safeParse(await response.json());
        if (parsed.success) {
          const body = parsed.data;
          location = {
            city: textField(body.city),
            region: textField(body.region_name),
            country: textField(body.country_name),
            countryCode: body.country_code,
          };
          success = true;
        }
      }
    } catch {
      // Provider failures must never prevent visit recording or site use.
    }
    await query(
      `INSERT INTO public.analytics_ip_locations
      (ip, city, region, country, country_code, expires_at, updated_at)
      VALUES ($1::inet, $2, $3, $4, $5, $6, now())
      ON CONFLICT (ip) DO UPDATE SET city = EXCLUDED.city, region = EXCLUDED.region,
        country = EXCLUDED.country, country_code = EXCLUDED.country_code,
        expires_at = EXCLUDED.expires_at, updated_at = now()`,
      [
        ip,
        location.city,
        location.region,
        location.country,
        location.countryCode,
        new Date(Date.now() + (success ? 7 * dayMs : 15 * 60000)),
      ],
    );
    return location;
  })();
  pendingLocations.set(ip, lookup);
  try {
    return await lookup;
  } finally {
    pendingLocations.delete(ip);
  }
}

export const heartbeatSchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(200)
    .regex(/^\/(?!\/)/)
    .refine((path) => !/[?#]/.test(path)),
});

export async function onlineAnalytics() {
  const result = await query(
    `SELECT count(DISTINCT visitor_id)::int AS online
    FROM public.analytics_visits WHERE last_seen >= $1`,
    [new Date(Date.now() - activeWindowSeconds * 1000)],
  );
  return { online: result.rows[0].online, activeWindowSeconds };
}

export async function adminAnalytics() {
  const cutoff = new Date(Date.now() - analyticsWindowDays * dayMs);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [counts, locations, recent] = await Promise.all([
    query(
      `SELECT count(DISTINCT visitor_id)::int AS "visitors30d",
      count(DISTINCT visitor_id) FILTER (WHERE last_seen >= $2)::int AS "visitorsToday",
      count(DISTINCT visitor_id) FILTER (WHERE last_seen >= $3)::int AS online
      FROM public.analytics_visits WHERE last_seen >= $1`,
      [cutoff, today, new Date(Date.now() - activeWindowSeconds * 1000)],
    ),
    query(
      `SELECT city, region, country, country_code AS "countryCode", count(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits WHERE last_seen >= $1
      GROUP BY city, region, country, country_code ORDER BY visitors DESC, country, region, city LIMIT 10`,
      [cutoff],
    ),
    query(
      `SELECT id, host(ip) AS ip, city, region, country, country_code AS "countryCode", path, last_seen AS "lastSeenAt"
      FROM (SELECT DISTINCT ON (visitor_id) * FROM public.analytics_visits WHERE last_seen >= $1
        ORDER BY visitor_id, last_seen DESC) latest ORDER BY last_seen DESC LIMIT 50`,
      [cutoff],
    ),
  ]);
  return {
    ...counts.rows[0],
    windowDays: analyticsWindowDays,
    activeWindowSeconds,
    topLocations: locations.rows,
    recentVisitors: recent.rows,
  };
}

export async function deleteBrowserAnalytics(req: Request, res: Response) {
  const token = req.cookies?.[cookieName()];
  if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token))
    await query("DELETE FROM public.analytics_visits WHERE visitor_id = $1", [
      hash(token),
    ]);
  res.clearCookie(cookieName(), cookieAttributes());
}

export function installPublicAnalytics(app: Express) {
  let lastCleanup = 0;
  app.get("/api/v1/analytics/online", async (_req, res) =>
    res.json(await onlineAnalytics()),
  );
  app.post(
    "/api/v1/analytics/heartbeat",
    rateLimit({
      store: sharedRateStore("analytics"),
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Visitor tracking is busy. Try again shortly." },
    }),
    async (req, res) => {
      const body = heartbeatSchema.parse(req.body);
      // req.ip obeys the app's explicit trusted-proxy configuration. Never read XFF directly.
      const ip = normalizeAnalyticsIp(req.ip || req.socket.remoteAddress);
      if (!ip)
        return res
          .status(400)
          .json({ error: "Visitor address is unavailable." });
      const token = ensureAnalyticsCookie(req, res);
      const visitorId = hash(token);
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const location = await locationForIp(ip);
      await query(
        `INSERT INTO public.analytics_visits
      (id, visitor_id, ip, visit_day, first_seen, last_seen, path, city, region, country, country_code)
      VALUES ($1, $2, $3::inet, $4, $5, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET last_seen = EXCLUDED.last_seen, path = EXCLUDED.path,
        city = EXCLUDED.city, region = EXCLUDED.region, country = EXCLUDED.country, country_code = EXCLUDED.country_code`,
        [
          hash(`${visitorId}:${ip}:${day}`),
          visitorId,
          ip,
          day,
          now,
          body.path,
          location.city,
          location.region,
          location.country,
          location.countryCode,
        ],
      );
      // Bound cleanup to once per hour per API process; queries always exclude expired data.
      if (Date.now() - lastCleanup > 3600000) {
        lastCleanup = Date.now();
        const cutoff = new Date(Date.now() - analyticsWindowDays * dayMs);
        await query(
          "DELETE FROM public.analytics_visits WHERE last_seen < $1",
          [cutoff],
        );
        await query(
          "DELETE FROM public.analytics_ip_locations WHERE updated_at < $1",
          [cutoff],
        );
      }
      res.json(await onlineAnalytics());
    },
  );
}
