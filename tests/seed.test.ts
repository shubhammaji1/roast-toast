import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { testDatabase } from "./postgres";
import { query } from "../apps/api/src/database";
import { seedDemo } from "../apps/api/src/seed";
import {
  IdeaModel,
  ProfileModel,
  RoastModel,
  Reaction,
  MilestoneModel,
  Revision,
  Setting,
} from "../apps/api/src/models";

let database: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  database = await testDatabase();
});
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SEED_DEMO", undefined);
  await query(
    "TRUNCATE public.profiles, public.settings, public.reactions CASCADE",
  );
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => database.close());

it("does not create demo content unless explicitly enabled", async () => {
  await seedDemo();
  expect(await IdeaModel.countDocuments()).toBe(0);
  expect(await ProfileModel.countDocuments()).toBe(0);
  expect(await Setting.exists({ key: "demo-seeded" })).toBe(false);
});

it("allows opting in through SEED_DEMO=1", async () => {
  vi.stubEnv("SEED_DEMO", "1");
  await seedDemo();
  expect(await IdeaModel.countDocuments({ demo: true })).toBe(6);
  expect(await Setting.exists({ key: "demo-seeded" })).toBe(true);
});

it("supports explicit test fixtures and preserves the idempotent seed marker", async () => {
  await seedDemo({ enabled: true });
  await seedDemo({ enabled: true });
  expect(await IdeaModel.countDocuments({ demo: true })).toBe(6);
  expect(await ProfileModel.countDocuments({ demo: true })).toBe(4);
  expect(await RoastModel.countDocuments()).toBe(2);
  expect(await Reaction.countDocuments()).toBe(7);
  expect(await MilestoneModel.countDocuments()).toBe(2);
  expect(await Revision.countDocuments()).toBe(6);
  expect(await Setting.countDocuments({ key: "demo-seeded" })).toBe(1);
});

it("never seeds production even with both explicit opt-ins", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SEED_DEMO", "1");
  await seedDemo({ enabled: true });
  expect(await IdeaModel.countDocuments()).toBe(0);
  expect(await ProfileModel.countDocuments()).toBe(0);
  expect(await Setting.exists({ key: "demo-seeded" })).toBe(false);
});
