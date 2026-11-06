import { afterEach, beforeEach, expect, it } from "vitest";
import { testDatabase } from "./postgres";
import { query, transaction } from "../apps/api/src/database";
import {
  applyDemoCleanup,
  planDemoCleanup,
} from "../apps/api/src/demo-cleanup";
import { seedDemo } from "../apps/api/src/seed";
import {
  Appeal,
  Audit,
  Block,
  CoffeeOrder,
  Collaboration,
  IdeaModel,
  Improvement,
  Media,
  MilestoneModel,
  ModerationAction,
  Notification,
  PaymentEvent,
  ProfileModel,
  Reaction,
  Reply,
  Report,
  Revision,
  RoastModel,
  Setting,
} from "../apps/api/src/models";

let database: Awaited<ReturnType<typeof testDatabase>>;
const firstDemoId = "000000000000000000000101";
beforeEach(async () => {
  process.env.NODE_ENV = "test";
  database = await testDatabase();
  await seedDemo({ enabled: true });
});
afterEach(async () => database?.close());

async function realContent() {
  await ProfileModel.create({
    userId: "real-maker",
    username: "real_maker",
    name: "Real maker",
  });
  const idea = await IdeaModel.create({
    authorId: "real-maker",
    title: "Keep this real post",
    status: "published",
    visibility: "public",
  });
  const roast = await RoastModel.create({
    ideaId: String(idea._id),
    authorId: "real-maker",
  });
  const reply = await Reply.create({
    ideaId: String(idea._id),
    roastId: String(roast._id),
    authorId: "real-maker",
  });
  return { idea, roast, reply };
}

it("previews only strict demo ideas without changing data or foreign keys", async () => {
  const { idea } = await realContent();
  const misleading = await IdeaModel.create({
    authorId: "real-maker",
    title: "String flag is not a demo",
    status: "published",
    visibility: "public",
    demo: "true",
  });
  const plan = await planDemoCleanup();
  expect(plan.ideaIds).toHaveLength(6);
  expect(plan.ideaIds).toContain(firstDemoId);
  expect(plan.ideaIds).not.toContain(String(idea._id));
  expect(plan.ideaIds).not.toContain(String(misleading._id));
  expect(plan.counts).toMatchObject({
    ideas: 6,
    roasts: 2,
    idea_revisions: 6,
    improvements: 1,
    milestones: 2,
    reactions: 7,
  });
  expect(
    Object.values(plan.nonDemoInteractions).every((count) => count === 0),
  ).toBe(true);
  expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(await IdeaModel.countDocuments()).toBe(8);
  expect(await RoastModel.countDocuments()).toBe(3);
  await expect(IdeaModel.deleteOne({ _id: firstDemoId })).rejects.toMatchObject(
    { code: "23503" },
  );
});

it("removes linked children in order while preserving real posts, profiles and history", async () => {
  const {
    idea,
    roast: retainedRoast,
    reply: retainedReply,
  } = await realContent();
  const demoRoast = await RoastModel.findOne({ ideaId: firstDemoId });
  const realRoast = await RoastModel.create({
    ideaId: firstDemoId,
    authorId: "real-maker",
  });
  await Reply.create({
    ideaId: firstDemoId,
    roastId: String(realRoast._id),
    authorId: "real-maker",
  });
  await Reply.create({
    ideaId: firstDemoId,
    roastId: String(demoRoast._id),
    authorId: "demo-sam",
  });
  await Reaction.create({
    targetId: String(realRoast._id),
    userId: "real-maker",
    kind: "helpful",
  });
  await Reaction.create({
    targetId: String(idea._id),
    userId: "real-maker",
    kind: "bookmark",
  });
  await Improvement.create({ ideaId: firstDemoId, authorId: "real-maker" });
  await MilestoneModel.create({ ideaId: firstDemoId, authorId: "real-maker" });
  await Collaboration.create({
    ideaId: firstDemoId,
    creatorId: "demo-sam",
    authorId: "real-maker",
  });
  await Notification.create({
    ideaId: firstDemoId,
    actorId: "demo-sam",
    userId: "real-maker",
  });
  await Report.create({
    targetType: "idea",
    targetId: firstDemoId,
    reporterId: "real-maker",
  });
  await Report.create({
    targetType: "roast",
    targetId: String(realRoast._id),
    reporterId: "real-maker",
  });
  const retainedReport = await Report.create({
    targetType: "user",
    targetId: "demo-sam",
    reporterId: "real-maker",
  });
  const audit = await Audit.create({
    targetId: firstDemoId,
    action: "keep.audit",
  });
  const moderation = await ModerationAction.create({
    targetId: firstDemoId,
    action: "keep.history",
  });
  const media = await Media.create({ ownerId: "demo-sam", key: "retain.webp" });
  const block = await Block.create({
    userId: "real-maker",
    blockedId: "demo-sam",
  });
  const appeal = await Appeal.create({ userId: "real-maker" });
  const profilesBefore = await ProfileModel.countDocuments();
  const plan = await planDemoCleanup();
  expect(plan.nonDemoInteractions).toMatchObject({
    roasts: 1,
    replies: 1,
    reactions: 1,
    reports: 2,
    notifications: 1,
    collaborations: 1,
    improvements: 1,
    milestones: 1,
  });
  expect(plan.preservedTables).toEqual(
    expect.arrayContaining([
      "profiles",
      "audit_logs",
      "moderation_actions",
      "coffee_orders",
      "payment_events",
      "settings",
    ]),
  );
  expect(await applyDemoCleanup(plan)).toEqual(plan);
  expect(await IdeaModel.findById(idea._id)).toBeTruthy();
  expect(await RoastModel.findById(retainedRoast._id)).toBeTruthy();
  expect(await Reply.findById(retainedReply._id)).toBeTruthy();
  expect(await ProfileModel.countDocuments()).toBe(profilesBefore);
  expect(await Report.findById(retainedReport._id)).toBeTruthy();
  expect(await Audit.findById(audit._id)).toBeTruthy();
  expect(await ModerationAction.findById(moderation._id)).toBeTruthy();
  expect(await Media.findById(media._id)).toBeTruthy();
  expect(await Block.findById(block._id)).toBeTruthy();
  expect(await Appeal.findById(appeal._id)).toBeTruthy();
  expect(await Setting.exists({ key: "demo-seeded" })).toBe(true);
  expect(await Reaction.countDocuments()).toBe(1);
  const emptyPlan = await planDemoCleanup();
  expect(emptyPlan.ideaIds).toEqual([]);
  expect(Object.values(emptyPlan.counts).every((count) => count === 0)).toBe(
    true,
  );
  await applyDemoCleanup(emptyPlan);
  await seedDemo({ enabled: true });
  expect(await IdeaModel.countDocuments()).toBe(1);
});

it("refuses a stale approval when new feedback arrives", async () => {
  await realContent();
  const plan = await planDemoCleanup();
  await RoastModel.create({ ideaId: firstDemoId, authorId: "real-maker" });
  await expect(applyDemoCleanup(plan)).rejects.toThrow("changed after preview");
  expect(await IdeaModel.exists({ _id: firstDemoId })).toBe(true);
  expect(await RoastModel.countDocuments({ ideaId: firstDemoId })).toBe(2);
});

it("refuses a stale approval after content changes even when counts do not", async () => {
  const plan = await planDemoCleanup();
  await RoastModel.updateOne(
    { ideaId: firstDemoId },
    { critique: "Changed feedback" },
  );
  const changed = await planDemoCleanup();
  expect(changed.counts).toEqual(plan.counts);
  expect(changed.fingerprint).not.toBe(plan.fingerprint);
  await expect(applyDemoCleanup(plan)).rejects.toThrow("changed after preview");
  expect(await IdeaModel.exists({ _id: firstDemoId })).toBe(true);
});

it("blocks financial history and preserves all related payment records", async () => {
  const order = await CoffeeOrder.create({
    ideaId: firstDemoId,
    amount: 99,
    state: "paid",
    idempotencyKey: "retained",
  });
  const event = await PaymentEvent.create({
    orderId: String(order._id),
    eventId: "retained-event",
  });
  const plan = await planDemoCleanup();
  expect(plan.blockers).toEqual({ coffeeOrders: 1, paymentEvents: 1 });
  await expect(applyDemoCleanup(plan)).rejects.toThrow(
    "historical payment records",
  );
  expect(await IdeaModel.countDocuments()).toBe(6);
  expect(await CoffeeOrder.findById(order._id)).toBeTruthy();
  expect(await PaymentEvent.findById(event._id)).toBeTruthy();
});

it("rolls earlier deletions back when a later deletion fails", async () => {
  // An unexpected referencing table simulates a future relation that the
  // cleanup utility does not know about. Existing foreign keys remain active.
  await query(
    "CREATE TABLE public.cleanup_guard (idea_id text REFERENCES public.ideas(id))",
  );
  await query("INSERT INTO public.cleanup_guard(idea_id) VALUES ($1)", [
    firstDemoId,
  ]);
  const plan = await planDemoCleanup();
  await expect(applyDemoCleanup(plan)).rejects.toMatchObject({ code: "23503" });
  expect((await planDemoCleanup()).fingerprint).toBe(plan.fingerprint);
  expect(await Revision.countDocuments()).toBe(6);
  expect(await RoastModel.countDocuments()).toBe(2);
  // Verify a failed cleanup did not poison the database connection.
  await transaction(async () => {
    await query("SELECT 1");
  });
});
