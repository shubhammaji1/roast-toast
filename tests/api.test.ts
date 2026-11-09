import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request, { type Agent } from "supertest";
import { testDatabase } from "./postgres";
import { query, transaction, migrateDatabase } from "../apps/api/src/database";
import sharp from "sharp";
import { createAuth } from "../apps/api/src/auth";
import { createApp } from "../apps/api/src/app";
import { seedDemo } from "../apps/api/src/seed";
import {
  ProfileModel,
  IdeaModel,
  PaymentEvent,
  CoffeeOrder,
} from "../apps/api/src/models";

let database: Awaited<ReturnType<typeof testDatabase>>;
let app: Awaited<ReturnType<typeof createApp>>;
let creator: Agent;
let reviewer: Agent;
let moderator: Agent;
let creatorId: string;
const origin = "http://localhost:3000";
const pitch = {
  title: "A neighborhood library for useful things",
  pitch:
    "Residents share rarely used tools and track their condition with photos.",
  category: "Local business",
  tone: "Honest",
  problem: "People buy tools they use once.",
  solution: "A shared inventory and lending calendar.",
  audience: "Apartment residents",
  status: "published",
};
async function publish(agent = creator, extra = {}) {
  const r = await agent
    .post("/api/v1/ideas")
    .set("Origin", origin)
    .send({ ...pitch, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.APP_ORIGIN = origin;
  process.env.BETTER_AUTH_SECRET =
    "test-only-secret-at-least-thirty-two-characters";
  database = await testDatabase();
  const auth = await createAuth(database.pool);
  app = await createApp(auth);
  creator = request.agent(app);
  reviewer = request.agent(app);
  moderator = request.agent(app);
  for (const [agent, name, email] of [
    [creator, "Creator", "creator@example.test"],
    [reviewer, "Reviewer", "reviewer@example.test"],
    [moderator, "Moderator", "moderator@example.test"],
  ] as const) {
    const res = await agent
      .post("/api/v1/auth/sign-up/email")
      .set("Origin", origin)
      .send({ name, email, password: "test-passphrase-12345" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const me = await agent.get("/api/v1/visitor-session");
    expect(me.body.user?.email).toBe(email);
    if (name === "Creator") creatorId = me.body.user.id;
    if (name === "Moderator")
      await ProfileModel.updateOne(
        { userId: me.body.user.id },
        { role: "admin" },
      );
  }
}, 120000);
afterAll(async () => {
  await database?.close();
});

describe("Accounts and access boundaries", () => {
  it("redirects the API root to its resource index", async () => {
    const root = await request(app).get("/");
    expect(root.status).toBe(307);
    expect(root.headers.location).toBe("/api/v1");
    const index = await request(app).get(root.headers.location);
    expect(index.status).toBe(200);
    expect(index.body).toMatchObject({
      name: "Roast & Toast API",
      version: "1",
    });
  });
  it("validates uploads and protects draft images and foreign attachments", async () => {
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#48644d" },
    })
      .png()
      .toBuffer();
    const upload = await creator.post("/api/v1/media").attach("image", image, {
      filename: "sample.png",
      contentType: "image/png",
    });
    expect(upload.status).toBe(201);
    expect((await reviewer.get(`/api/v1/media/${upload.body.id}`)).status).toBe(
      404,
    );
    expect((await creator.get(`/api/v1/media/${upload.body.id}`)).status).toBe(
      200,
    );
    expect(
      (
        await reviewer
          .post("/api/v1/ideas")
          .send({ ...pitch, coverImage: upload.body.id })
      ).status,
    ).toBe(400);
    const draft = await publish(creator, {
      status: "draft",
      coverImage: upload.body.id,
    });
    expect(
      (await request(app).get(`/api/v1/media/${upload.body.id}`)).status,
    ).toBe(404);
    await creator
      .patch(`/api/v1/ideas/${draft.id}`)
      .send({ ...pitch, coverImage: upload.body.id, version: draft.version });
    expect(
      (await request(app).get(`/api/v1/media/${upload.body.id}`)).headers[
        "content-type"
      ],
    ).toContain("image/webp");
    expect(
      (
        await creator
          .post("/api/v1/media")
          .attach("image", Buffer.from("<svg><script>bad()</script></svg>"), {
            filename: "fake.png",
            contentType: "image/png",
          })
      ).status,
    ).toBe(400);
  });
  it("accepts account-free writes and rejects untrusted origins", async () => {
    expect((await request(app).post("/api/v1/ideas").send(pitch)).status).toBe(
      201,
    );
    expect(
      (
        await creator
          .post("/api/v1/ideas")
          .set("Origin", "https://untrusted.example")
          .send(pitch)
      ).status,
    ).toBe(403);
  });
  it("persists cover removal and makes the detached image private", async () => {
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#48644d" },
    })
      .png()
      .toBuffer();
    const upload = await creator.post("/api/v1/media").attach("image", image, {
      filename: "removable-cover.png",
      contentType: "image/png",
    });
    expect(upload.status).toBe(201);
    const idea = await publish(creator, {
      coverImage: upload.body.id,
      buyMeACoffeeUrl: "https://buymeacoffee.com/BeyondTheSyntax",
      tags: ["Repair"],
    });
    expect(
      (await request(app).get(`/api/v1/media/${upload.body.id}`)).status,
    ).toBe(200);
    const { coverImage: _coverImage, ...withoutCover } = idea;
    const removed = await creator
      .patch(`/api/v1/ideas/${idea.id}`)
      .send(withoutCover);
    expect(removed.status).toBe(200);
    expect(removed.body).not.toHaveProperty("coverImage");
    expect(removed.body).toMatchObject({
      title: idea.title,
      authorId: idea.authorId,
      createdAt: idea.createdAt,
      tags: ["Repair"],
      buyMeACoffeeUrl: idea.buyMeACoffeeUrl,
      version: idea.version + 1,
    });
    expect(await IdeaModel.findById(idea.id)).not.toHaveProperty("coverImage");
    const detail = await request(app).get(`/api/v1/ideas/${idea.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.idea).not.toHaveProperty("coverImage");
    expect(detail.body.revisions).toHaveLength(2);
    expect(
      (await request(app).get(`/api/v1/media/${upload.body.id}`)).status,
    ).toBe(404);
    expect((await creator.get(`/api/v1/media/${upload.body.id}`)).status).toBe(
      200,
    );
  });
  it("keeps drafts out of discovery and denies every nested draft write to outsiders", async () => {
    const draft = await publish(creator, {
      status: "draft",
      title: "Private draft should never be discoverable",
    });
    expect((await request(app).get(`/api/v1/ideas/${draft.id}`)).status).toBe(
      404,
    );
    expect(
      (
        await reviewer.post(`/api/v1/ideas/${draft.id}/roasts`).send({
          tone: "Honest",
          critique: "This should never be accepted.",
          suggestion: "Do not disclose private draft data.",
        })
      ).status,
    ).toBe(404);
    const feed = await request(app).get("/api/v1/ideas?q=Private");
    expect(feed.body.ideas).toHaveLength(0);
    expect((await creator.get(`/api/v1/ideas/${draft.id}`)).status).toBe(200);
  });
  it("allows unlisted direct access but excludes unlisted ideas from discovery", async () => {
    const idea = await publish(creator, {
      visibility: "unlisted",
      title: "Unlisted apartment library experiment",
    });
    expect((await request(app).get(`/api/v1/ideas/${idea.id}`)).status).toBe(
      200,
    );
    expect(
      (await request(app).get("/api/v1/ideas?q=Unlisted")).body.ideas,
    ).toHaveLength(0);
  });
  it("enforces ownership, versions, and revision history", async () => {
    const idea = await publish();
    const body = {
      ...pitch,
      title: "Updated apartment library experiment",
      version: idea.version,
    };
    expect(
      (await reviewer.patch(`/api/v1/ideas/${idea.id}`).send(body)).status,
    ).toBe(403);
    expect(
      (await creator.patch(`/api/v1/ideas/${idea.id}`).send(body)).status,
    ).toBe(200);
    expect(
      (await creator.patch(`/api/v1/ideas/${idea.id}`).send(body)).status,
    ).toBe(409);
    const detail = await creator.get(`/api/v1/ideas/${idea.id}`);
    expect(detail.body.revisions).toHaveLength(2);
    expect(detail.body.idea.title).toBe(body.title);
  });
  it("removes deleted ideas from public reads", async () => {
    const idea = await publish();
    expect((await reviewer.delete(`/api/v1/ideas/${idea.id}`)).status).toBe(
      403,
    );
    expect((await creator.delete(`/api/v1/ideas/${idea.id}`)).status).toBe(200);
    expect((await creator.get(`/api/v1/ideas/${idea.id}`)).status).toBe(404);
  });
  it("keeps test email links private to their recipient", async () => {
    const { EmailMessage } = await import("../apps/api/src/models");
    await EmailMessage.create({
      to: "creator@example.test",
      subject: "Recipient privacy fixture",
      text: "A private message",
    });
    const mine = await creator.get("/api/v1/dev/outbox");
    expect(mine.body.length).toBeGreaterThan(0);
    expect(
      mine.body.every((mail: any) => mail.to === "creator@example.test"),
    ).toBe(true);
    expect((await request(app).get("/api/v1/dev/outbox")).status).toBe(401);
  });
  it("uses unique usernames and respects profile privacy", async () => {
    const payload = {
      name: "Creator",
      username: "test_creator",
      bio: "Private bio text",
      skills: ["Research"],
      website: "https://example.com",
      private: true,
    };
    expect(
      (await creator.patch("/api/v1/profiles/me").send(payload)).status,
    ).toBe(200);
    const guest = await request(app).get("/api/v1/profiles/test_creator");
    expect(guest.body.profile.bio).toBe("");
    expect(guest.body.ideas).toEqual([]);
    expect(
      (await reviewer.patch("/api/v1/profiles/me").send(payload)).status,
    ).toBe(409);
    await creator
      .patch("/api/v1/profiles/me")
      .send({ ...payload, private: false });
  });
});

describe("The feedback and build loop", () => {
  it("accepts constructive roasts, respects tone, supports replies and creator acknowledgments", async () => {
    const idea = await publish();
    const feedback = {
      tone: "Honest",
      critique: "You need a way to handle damage to borrowed tools.",
      suggestion:
        "Try a deposit and condition photos in one apartment building.",
    };
    expect(
      (
        await reviewer
          .post(`/api/v1/ideas/${idea.id}/roasts`)
          .send({ ...feedback, tone: "Savage" })
      ).status,
    ).toBe(400);
    const roast = await reviewer
      .post(`/api/v1/ideas/${idea.id}/roasts`)
      .send(feedback);
    expect(roast.status).toBe(201);
    expect(
      (
        await creator
          .post(`/api/v1/roasts/${roast.body.id}/replies`)
          .send({ body: "Good point. I will test photos first." })
      ).status,
    ).toBe(201);
    expect(
      (await reviewer.post(`/api/v1/roasts/${roast.body.id}/acknowledge`))
        .status,
    ).toBe(403);
    expect(
      (await creator.post(`/api/v1/roasts/${roast.body.id}/acknowledge`))
        .status,
    ).toBe(200);
    await creator
      .post(`/api/v1/roasts/${roast.body.id}/helpful`)
      .send({ active: true });
    await creator
      .post(`/api/v1/roasts/${roast.body.id}/helpful`)
      .send({ active: true });
    const detail = await creator.get(`/api/v1/ideas/${idea.id}`);
    expect(detail.body.roasts[0].replies).toHaveLength(1);
    expect(detail.body.roasts[0].helpful).toBe(1);
    expect(detail.body.roasts[0].acknowledged).toBe(true);
  });
  it("makes reactions idempotent, saves ideas, and follows build updates", async () => {
    const idea = await publish();
    for (const kind of ["interest", "bookmark", "follow"]) {
      await reviewer
        .post(`/api/v1/ideas/${idea.id}/reactions`)
        .send({ kind, active: true });
      await reviewer
        .post(`/api/v1/ideas/${idea.id}/reactions`)
        .send({ kind, active: true });
    }
    const detail = await reviewer.get(`/api/v1/ideas/${idea.id}`);
    expect(detail.body.idea.interests).toBe(1);
    expect(detail.body.idea.saved).toBe(true);
    expect(
      (await reviewer.get("/api/v1/ideas?tab=saved")).body.ideas.some(
        (i: any) => i.id === idea.id,
      ),
    ).toBe(true);
    const milestone = await creator
      .post(`/api/v1/ideas/${idea.id}/milestones`)
      .send({
        title: "A first real customer interview",
        body: "Interviewed five neighbors about borrowing tools and the damage concerns.",
        stage: "Validating",
      });
    expect(milestone.status).toBe(201);
    const notes = await reviewer.get("/api/v1/notifications");
    expect(notes.body.some((n: any) => n.ideaId === idea.id)).toBe(true);
    await reviewer.post("/api/v1/notifications/read");
    expect(
      (await reviewer.get("/api/v1/notifications")).body.every(
        (n: any) => n.readAt,
      ),
    ).toBe(true);
  });
  it("lets only creators triage suggestions and collaboration requests", async () => {
    const idea = await publish();
    const s = await reviewer
      .post(`/api/v1/ideas/${idea.id}/improvements`)
      .send({
        category: "Product",
        body: "Add a tool condition checklist to each loan and return.",
      });
    expect(s.status).toBe(201);
    expect(
      (
        await reviewer
          .patch(`/api/v1/improvements/${s.body.id}`)
          .send({ state: "Implemented" })
      ).status,
    ).toBe(403);
    expect(
      (
        await creator
          .patch(`/api/v1/improvements/${s.body.id}`)
          .send({ state: "Exploring" })
      ).status,
    ).toBe(200);
    const c = await reviewer
      .post(`/api/v1/ideas/${idea.id}/collaborations`)
      .send({
        body: "I can help with interviews and a lightweight booking interface.",
      });
    expect(c.status).toBe(201);
    expect(
      (
        await reviewer
          .patch(`/api/v1/collaborations/${c.body.id}`)
          .send({ state: "accepted" })
      ).status,
    ).toBe(404);
    expect(
      (
        await creator
          .patch(`/api/v1/collaborations/${c.body.id}`)
          .send({ state: "accepted" })
      ).status,
    ).toBe(200);
  });
  it("tracks validation experiments and keeps feedback synthesis creator-only", async () => {
    const idea = await publish();
    const roast = await reviewer
      .post(`/api/v1/ideas/${idea.id}/roasts`)
      .send({
        tone: "Honest",
        critique: "The lending process needs a clearer trust signal.",
        suggestion: "Try a simple identity check with a small resident group.",
        punchline: "",
      });
    expect(roast.status).toBe(201);
    await creator
      .post(`/api/v1/roasts/${roast.body.id}/helpful`)
      .send({ active: true });
    const suggestion = await reviewer
      .post(`/api/v1/ideas/${idea.id}/improvements`)
      .send({
        category: "Feasibility",
        body: "Test a manual sign-out sheet before building an app.",
      });
    expect(suggestion.status).toBe(201);
    await creator
      .patch(`/api/v1/improvements/${suggestion.body.id}`)
      .send({ state: "Implemented" });

    const plan = await creator
      .post(`/api/v1/ideas/${idea.id}/experiments`)
      .send({
        hypothesis: "Residents will lend tools to known neighbors.",
        experiment: "Offer a paper-based lending trial to ten households.",
        successCriteria: "At least five loans are completed without issues.",
      });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);
    expect(plan.body).toMatchObject({
      kind: "experiment",
      status: "Planned",
      successCriteria: "At least five loans are completed without issues.",
    });
    expect(
      (
        await reviewer
          .patch(`/api/v1/experiments/${plan.body.id}`)
          .send({ status: "In progress" })
      ).status,
    ).toBe(403);
    const updated = await creator
      .patch(`/api/v1/experiments/${plan.body.id}`)
      .send({
        status: "Complete",
        outcome: "Six loans completed; two participants asked for reminders.",
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      status: "Complete",
      outcome: "Six loans completed; two participants asked for reminders.",
    });

    const ownerDetail = await creator.get(`/api/v1/ideas/${idea.id}`);
    expect(ownerDetail.body.feedbackSummary).toMatchObject({
      roastCount: 1,
      helpfulVotes: 1,
      suggestionCount: 1,
      implementedSuggestions: 1,
      suggestionCategories: [{ category: "Feasibility", count: 1 }],
    });
    expect(ownerDetail.body.milestones[0]).toMatchObject({
      kind: "experiment",
      status: "Complete",
    });
    expect((await reviewer.get(`/api/v1/ideas/${idea.id}`)).body.feedbackSummary)
      .toBeNull();
  });
  it("filters search and categories, and paginates without duplicates", async () => {
    const unique = await publish(creator, {
      title: "Searchable unique pantry exchange",
      category: "Tech",
    });
    const matches = await request(app).get(
      "/api/v1/ideas?q=unique%20pantry&category=Tech",
    );
    expect(matches.body.ideas.map((i: any) => i.id)).toEqual([unique.id]);
    const page1 = await request(app).get("/api/v1/ideas?limit=2");
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await request(app).get(
      `/api/v1/ideas?limit=2&cursor=${page1.body.nextCursor}`,
    );
    const ids = [...page1.body.ideas, ...page2.body.ideas].map(
      (i: any) => i.id,
    );
    expect(new Set(ids).size).toBe(4);
  });
  it("blocks interactions in both directions", async () => {
    const idea = await publish();
    await reviewer
      .post("/api/v1/blocks")
      .send({ blockedId: creatorId, active: true });
    expect((await reviewer.get(`/api/v1/ideas/${idea.id}`)).status).toBe(404);
    const reviewerIdea = await publish(reviewer);
    expect((await creator.get(`/api/v1/ideas/${reviewerIdea.id}`)).status).toBe(
      404,
    );
    await reviewer
      .post("/api/v1/blocks")
      .send({ blockedId: creatorId, active: false });
  });
});

describe("Moderation and payment trust", () => {
  it("documents every route and restricts audited community configuration to moderators", async () => {
    const openapi = await request(app).get("/api/v1/openapi.json");
    expect(openapi.status, JSON.stringify(openapi.body)).toBe(200);
    expect(Object.keys(openapi.body.paths).length).toBeGreaterThan(30);
    expect(
      openapi.body.paths["/api/v1/ideas/{id}/roasts"].post.requestBody,
    ).toBeTruthy();
    const config = (await request(app).get("/api/v1/community-settings")).body;
    expect(
      (await reviewer.patch("/api/v1/admin/community-settings").send(config))
        .status,
    ).toBe(403);
    expect(
      (
        await moderator
          .patch("/api/v1/admin/community-settings")
          .send({ ...config, publishingEnabled: false, coffeeEnabled: false })
      ).status,
    ).toBe(200);
    expect((await creator.post("/api/v1/ideas").send(pitch)).status).toBe(503);
    const draft = await publish(creator, { status: "draft" });
    expect(draft.status).toBe("draft");
    expect(
      (await moderator.patch("/api/v1/admin/community-settings").send(config))
        .status,
    ).toBe(200);
  });
  it("keeps moderation restricted and records report decisions", async () => {
    expect((await reviewer.get("/api/v1/admin")).status).toBe(403);
    const idea = await publish();
    const report = await reviewer.post("/api/v1/reports").send({
      targetId: idea.id,
      targetType: "idea",
      reason: "This content needs a moderator review.",
    });
    expect(report.status).toBe(201);
    const panel = await moderator.get("/api/v1/admin");
    expect(panel.status).toBe(200);
    const row = panel.body.reports.find((r: any) => r.targetId === idea.id);
    expect(
      (
        await moderator.patch(`/api/v1/admin/reports/${row.id}`).send({
          state: "resolved",
          resolution: "Reviewed and hidden for the community.",
          hide: true,
        })
      ).status,
    ).toBe(200);
    expect((await request(app).get(`/api/v1/ideas/${idea.id}`)).status).toBe(
      404,
    );
  });
  it("saves optional creator URLs, normalizes them, and rejects spoofed links", async () => {
    const guest = request.agent(app);
    const idea = await publish(guest, {
      creatorName: "Independent maker",
      buyMeACoffeeUrl: "https://www.buymeacoffee.com/testmaker/?ref=pitch",
    });
    expect(idea.buyMeACoffeeUrl).toBe("https://buymeacoffee.com/testmaker");
    expect(idea.author.name).toBe("Independent maker");
    expect(
      (await guest.get(`/api/v1/ideas/${idea.id}`)).body.idea.buyMeACoffeeUrl,
    ).toBe(idea.buyMeACoffeeUrl);
    for (const url of [
      "https://buymeacoffee.com.attacker.test/maker",
      "http://buymeacoffee.com/maker",
      "https://buymeacoffee.com/signup",
      "https://evil.test",
      "javascript:alert(1)",
    ]) {
      expect(
        (
          await guest
            .patch(`/api/v1/ideas/${idea.id}`)
            .send({ ...pitch, version: idea.version, buyMeACoffeeUrl: url })
        ).status,
      ).toBe(400);
    }
    const edited = await guest.patch(`/api/v1/ideas/${idea.id}`).send({
      ...pitch,
      version: idea.version,
      buyMeACoffeeUrl: "https://buymeacoffee.com/newmaker",
    });
    expect(edited.status).toBe(200);
    expect(edited.body.buyMeACoffeeUrl).toBe(
      "https://buymeacoffee.com/newmaker",
    );
    expect((await publish(guest)).buyMeACoffeeUrl).toBe("");
  });
  it.each([
    "https://buymeacoffee.com/BeyondTheSyntax",
    "buymeacoffee.com/BeyondTheSyntax",
  ])("publishes and reads the creator's exact support URL %s", async (url) => {
    const guest = request.agent(app);
    const idea = await publish(guest, {
      creatorName: "Beyond The Syntax",
      buyMeACoffeeUrl: url,
    });
    expect(idea.id).toMatch(/^[a-f0-9]{24}$/);
    expect(idea.buyMeACoffeeUrl).toBe(
      "https://buymeacoffee.com/BeyondTheSyntax",
    );
    const detail = await request(app).get(`/api/v1/ideas/${idea.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.idea.buyMeACoffeeUrl).toBe(idea.buyMeACoffeeUrl);
    expect(detail.body.idea.author.name).toBe("Beyond The Syntax");
    expect(detail.body.revisions).toHaveLength(1);
  });
  it("applies publishing and category settings when promoting drafts", async () => {
    const config = (await moderator.get("/api/v1/community-settings")).body;
    const draft = await publish(creator, { status: "draft" });
    const published = await publish(creator);
    try {
      await moderator
        .patch("/api/v1/admin/community-settings")
        .send({ ...config, publishingEnabled: false });
      expect(
        (
          await creator
            .patch(`/api/v1/ideas/${draft.id}`)
            .send({ ...pitch, version: draft.version })
        ).status,
      ).toBe(503);
      expect(
        (
          await creator
            .patch(`/api/v1/ideas/${published.id}`)
            .send({ ...pitch, version: published.version })
        ).status,
      ).toBe(200);
      await moderator
        .patch("/api/v1/admin/community-settings")
        .send({ ...config, categories: ["Tech"] });
      expect(
        (
          await creator
            .patch(`/api/v1/ideas/${draft.id}`)
            .send({ ...pitch, version: draft.version })
        ).status,
      ).toBe(400);
      expect(
        (await creator.get(`/api/v1/ideas/${draft.id}`)).body.idea.status,
      ).toBe("draft");
    } finally {
      await moderator.patch("/api/v1/admin/community-settings").send(config);
    }
  });
  it("retires simulated checkouts and never invents payment records", async () => {
    const idea = await publish();
    for (const path of [
      `/api/v1/ideas/${idea.id}/coffee`,
      `/api/v1/coffee/${idea.id}/simulate`,
      `/api/v1/coffee/${idea.id}/refund`,
      "/api/v1/payments/webhook",
    ])
      expect((await reviewer.post(path).send({ amount: 99 })).status).toBe(410);
    expect(await CoffeeOrder.countDocuments()).toBe(0);
    expect(await PaymentEvent.countDocuments()).toBe(0);
  });
  it("exports only the authenticated member’s private content", async () => {
    const draft = await publish(creator, { status: "draft" });
    const exported = await creator.get("/api/v1/my-data");
    expect(exported.status).toBe(200);
    expect(exported.body.ideas.some((i: any) => i._id === draft.id)).toBe(true);
    expect(
      exported.body.ideas.every((i: any) => i.authorId === creatorId),
    ).toBe(true);
    expect(exported.body.account.password).toBeUndefined();
    expect((await request(app).get("/api/v1/my-data")).status).toBe(401);
  });
});

describe("Account removal", () => {
  it("deletes authentication and anonymizes a freshly authenticated account", async () => {
    const idea = await publish(moderator);
    const removed = await moderator
      .delete("/api/v1/my-data")
      .send({ confirmation: "DELETE MY ACCOUNT" });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(
      (await moderator.get("/api/v1/visitor-session")).body.user.anonymous,
    ).toBe(true);
    expect((await request(app).get(`/api/v1/ideas/${idea.id}`)).status).toBe(
      404,
    );
  });
});

describe("Account-free browser ownership on PostgreSQL", () => {
  it("keeps tables unavailable to Supabase public API roles", async () => {
    await query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;");
    await migrateDatabase();
    await expect(
      transaction(async (client) => {
        await client.query("SET LOCAL ROLE anon");
        await client.query("SELECT * FROM public.visitor_sessions");
      }),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      transaction(async (client) => {
        await client.query("SET LOCAL ROLE authenticated");
        await client.query("SELECT * FROM public.ideas");
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("creates a cookie identity without an authentication account, and protects ownership", async () => {
    const count = (
      await query('SELECT count(*)::int AS total FROM public."user"')
    ).rows[0].total;
    const a = request.agent(app),
      b = request.agent(app);
    const me = await a.get("/api/v1/visitor-session");
    expect(me.body.user.anonymous).toBe(true);
    expect(me.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect(me.headers["set-cookie"][0]).toMatch(/SameSite=Lax/);
    expect(
      (await query('SELECT count(*)::int AS total FROM public."user"')).rows[0]
        .total,
    ).toBe(count);
    const idea = await publish(a);
    const draft = await publish(a, { status: "draft" });
    expect((await b.get(`/api/v1/ideas/${draft.id}`)).status).toBe(404);
    expect(
      (
        await b
          .patch(`/api/v1/ideas/${idea.id}`)
          .send({ ...pitch, version: idea.version })
      ).status,
    ).toBe(403);
    expect(
      (
        await a
          .patch(`/api/v1/ideas/${idea.id}`)
          .send({ ...pitch, version: idea.version })
      ).status,
    ).toBe(200);
    const removed = await a
      .delete("/api/v1/my-data")
      .send({ confirmation: "DELETE MY DATA" });
    expect(removed.status).toBe(200);
    const next = (await a.get("/api/v1/visitor-session")).body;
    expect(next.user.id).not.toBe(me.body.user.id);
    expect((await request(app).get(`/api/v1/ideas/${idea.id}`)).status).toBe(
      404,
    );
  });
  it("rolls transactions back, enforces foreign keys, and reapplies migrations safely", async () => {
    const initial = await IdeaModel.countDocuments();
    await expect(
      transaction(async () => {
        await IdeaModel.create({ ...pitch, authorId: creatorId });
        throw new Error("rollback test");
      }),
    ).rejects.toThrow("rollback test");
    expect(await IdeaModel.countDocuments()).toBe(initial);
    const before = await IdeaModel.countDocuments();
    await expect(
      IdeaModel.create({ ...pitch, authorId: "nonexistent-owner" }),
    ).rejects.toMatchObject({ code: "23503" });
    expect(await IdeaModel.countDocuments()).toBe(before);
    await migrateDatabase();
  });
  it("commits only one concurrent revision", async () => {
    const a = request.agent(app);
    const idea = await publish(a);
    const results = await Promise.all([
      a.patch(`/api/v1/ideas/${idea.id}`).send({
        ...pitch,
        version: idea.version,
        title: "First competing revision",
      }),
      a.patch(`/api/v1/ideas/${idea.id}`).send({
        ...pitch,
        version: idea.version,
        title: "Second competing revision",
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (await a.get(`/api/v1/ideas/${idea.id}`)).body.revisions,
    ).toHaveLength(2);
  });
  it("returns the seeded idea at its canonical API URL and validates identifiers", async () => {
    await seedDemo({ enabled: true });
    const detail = await request(app).get(
      "/api/v1/ideas/000000000000000000000101",
    );
    expect(detail.status).toBe(200);
    expect(detail.body.idea.id).toBe("000000000000000000000101");
    expect(detail.body.idea.author.name).toBe("Sam Parker");
    expect(detail.body.roasts).toBeInstanceOf(Array);
    expect(detail.body.revisions).toBeInstanceOf(Array);
    expect(detail.headers["cache-control"]).toBe("no-store");
    for (const badId of ["not-an-id", "000000000000000000000101%22"])
      expect((await request(app).get(`/api/v1/ideas/${badId}`)).status).toBe(
        404,
      );
  });
});
