import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import request from "supertest";
import { testDatabase } from "./postgres";
import { createAuth } from "../apps/api/src/auth";
import { createApp } from "../apps/api/src/app";
import { EmailMessage, MilestoneModel } from "../apps/api/src/models";
import { sendSprintReminders } from "../apps/api/src/sprint-reminders";

const sdk = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    authenticateRequest: sdk.authenticateRequest,
    users: { getUser: sdk.getUser, deleteUser: sdk.deleteUser },
    sessions: { getSession: sdk.getSession },
  }),
}));
let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "clerk-test-secret-at-least-thirty-two-characters",
  );
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_mock");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_mock");
  database = await testDatabase();
  app = await createApp(await createAuth(database.pool));
});
afterAll(async () => {
  await database?.close();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.clearAllMocks();
  sdk.authenticateRequest.mockImplementation(async (req: Request) => ({
    toAuth: () =>
      ({
        "Bearer verified-session": {
          userId: "user_clerk_owner",
          sessionId: "sess_owner",
        },
        "Bearer verified-other": {
          userId: "user_clerk_other",
          sessionId: "sess_other",
        },
        "Bearer verified-publisher": {
          userId: "user_clerk_publisher",
          sessionId: "sess_publisher",
        },
      })[req.headers.get("authorization") || ""] || null,
  }));
  sdk.getUser.mockImplementation(async (id: string) => ({
    id,
    firstName: id === "user_clerk_owner" ? "Clerk" : "Another",
    lastName: "Maker",
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      {
        id: "email_1",
        emailAddress:
          id === "user_clerk_owner"
            ? "clerk@example.test"
            : "another@example.test",
        verification: { status: "verified" },
      },
    ],
  }));
  sdk.getSession.mockResolvedValue({ status: "active", createdAt: Date.now() });
});

it("passes a canonical authorized party to Clerk when APP_ORIGIN includes whitespace and a trailing slash", async () => {
  const original = process.env.APP_ORIGIN;
  vi.stubEnv("APP_ORIGIN", "  https://clerk-origin.example.test/  ");
  try {
    const response = await request(app)
      .get("/api/v1/visitor-session")
      .set("Authorization", "Bearer verified-publisher");
    expect(response.status).toBe(200);
    expect(sdk.authenticateRequest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        authorizedParties: ["https://clerk-origin.example.test"],
      }),
    );
    expect(new URL(sdk.authenticateRequest.mock.calls[0][0].url).origin).toBe(
      "https://clerk-origin.example.test",
    );
  } finally {
    vi.stubEnv("APP_ORIGIN", original);
  }
});

it("requires Clerk to post while keeping the public feed shared and dashboards separate", async () => {
  const guest = request.agent(app);
  const denied = await guest.post("/api/v1/ideas").send({
    title: "Guest pitch",
    pitch: "A useful idea without an account.",
    category: "Tech",
    status: "published",
  });
  expect(denied.status).toBe(401);
  expect(denied.body.error).toContain("Clerk");
  expect((await guest.post("/api/v1/media")).status).toBe(401);

  const owner = request.agent(app);
  const created = await owner
    .post("/api/v1/ideas")
    .set("Authorization", "Bearer verified-publisher")
    .send({
      title: "A shared public pitch",
      pitch: "Everyone can browse this published idea.",
      category: "Tech",
      status: "published",
    });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  expect(
    (
      await owner
        .post("/api/v1/media")
        .set("Authorization", "Bearer verified-publisher")
    ).status,
  ).toBe(400);

  const other = request.agent(app);
  const theirIdeas = await other
    .get("/api/v1/ideas?tab=mine")
    .set("Authorization", "Bearer verified-other");
  expect(theirIdeas.status).toBe(200);
  expect(
    theirIdeas.body.ideas.some(
      (idea: { id: string }) => idea.id === created.body.id,
    ),
  ).toBe(false);

  const publicIdeas = await guest.get("/api/v1/ideas?tab=latest");
  expect(
    publicIdeas.body.ideas.some(
      (idea: { id: string }) => idea.id === created.body.id,
    ),
  ).toBe(true);

  const ownersIdeas = await owner
    .get("/api/v1/ideas?tab=mine")
    .set("Authorization", "Bearer verified-publisher");
  expect(
    ownersIdeas.body.ideas.some(
      (idea: { id: string }) => idea.id === created.body.id,
    ),
  ).toBe(true);
});

it("links a Clerk identity without changing guest ownership, then restores it on another device", async () => {
  const guest = request.agent(app);
  const before = await guest.get("/api/v1/visitor-session");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  const idea = await guest.post("/api/v1/ideas").send({
    title: "Clerk workspace recovery test",
    pitch:
      "Keep this unpublished idea and sprint when signing in on a second device.",
    category: "Tech",
    status: "draft",
  });
  expect(idea.status).toBe(201);
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_mock");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_mock");
  const sprint = await guest
    .post(`/api/v1/ideas/${idea.body.id}/experiments`)
    .send({
      hypothesis: "Founders want recoverable plans.",
      experiment: "Open the same plan from another device.",
      successCriteria: "The original plan is editable.",
      sprint: { targetCustomer: "First-time founders" },
    });
  const linked = await guest
    .post("/api/v1/workspace/link")
    .set("Authorization", "Bearer verified-session")
    .send({});
  expect(linked.status, JSON.stringify(linked.body)).toBe(200);
  const other = request.agent(app);
  const me = await other
    .get("/api/v1/visitor-session")
    .set("Authorization", "Bearer verified-session");
  expect(me.body).toMatchObject({
    authProvider: "clerk",
    user: { id: before.body.user.id, emailVerified: true },
  });
  expect(
    (
      await other
        .get(`/api/v1/ideas/${idea.body.id}`)
        .set("Authorization", "Bearer verified-session")
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app)
        .get(`/api/v1/ideas/${idea.body.id}`)
        .set("Cookie", before.headers["set-cookie"])
    ).status,
  ).toBe(404);
  expect(
    (
      await other
        .patch("/api/v1/workspace/preferences")
        .set("Authorization", "Bearer verified-session")
        .send({ sprintReminders: true })
    ).status,
  ).toBe(200);
  const now = new Date();
  await MilestoneModel.updateOne(
    { _id: sprint.body.id },
    {
      $set: {
        sprint: {
          ...sprint.body.sprint,
          deadline: new Date(now.getTime() + 3600000).toISOString(),
        },
      },
    },
  );
  await sendSprintReminders(now);
  await sendSprintReminders(now);
  expect(await EmailMessage.countDocuments({ to: "clerk@example.test" })).toBe(
    1,
  );
  expect(sdk.authenticateRequest).toHaveBeenCalledWith(expect.any(Request), {
    authorizedParties: ["http://localhost:3000"],
    acceptsToken: "session_token",
  });
});
it("refuses revoked Clerk sessions and does not trust client-supplied identity headers", async () => {
  sdk.getSession.mockResolvedValue({
    status: "revoked",
    createdAt: Date.now(),
  });
  expect(
    (
      await request(app)
        .get("/api/v1/visitor-session")
        .set("Authorization", "Bearer verified-session")
    ).status,
  ).toBe(401);
  const forged = await request(app)
    .get("/api/v1/visitor-session")
    .set("x-clerk-user-id", "user_clerk_owner");
  expect(forged.body.user.anonymous).toBe(true);
});
it("requires verified primary email before attaching a workspace", async () => {
  sdk.getUser.mockResolvedValue({
    id: "user_unverified",
    firstName: "New",
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      {
        id: "email_1",
        emailAddress: "new@example.test",
        verification: { status: "unverified" },
      },
    ],
  });
  expect(
    (
      await request(app)
        .post("/api/v1/workspace/link")
        .set("Authorization", "Bearer verified-session")
        .send({})
    ).status,
  ).toBe(403);
});
