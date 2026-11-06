import { createHash } from "node:crypto";
import { query, transaction } from "./database.js";

// Order is intentional: retain SQL foreign keys and remove children first.
const deletionOrder = [
  "replies",
  "reactions",
  "reports",
  "notifications",
  "collaborations",
  "milestones",
  "improvements",
  "idea_revisions",
  "roasts",
  "ideas",
] as const;
type CleanupTable = (typeof deletionOrder)[number];
type Counts = Record<CleanupTable, number>;
type SelectedRow = { id: string; digest: string; non_demo: boolean };

export type DemoCleanupPlan = {
  ideaIds: string[];
  counts: Counts;
  nonDemoInteractions: Counts;
  blockers: { coffeeOrders: number; paymentEvents: number };
  fingerprint: string;
  preservedTables: string[];
};
type Selection = {
  plan: DemoCleanupPlan;
  rows: Record<CleanupTable, SelectedRow[]>;
};

const preservedTables = [
  "profiles",
  "visitor_sessions",
  "media",
  "settings",
  "coffee_orders",
  "payment_events",
  "audit_logs",
  "moderation_actions",
  "blocks",
  "appeals",
  "email_messages",
  "user",
  "session",
  "account",
  "verification",
  "rateLimit",
];

const demoActor = (field: string) =>
  `EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=t.data->>'${field}' AND p.data->'demo'='true'::jsonb)`;

async function selectCleanup(): Promise<Selection> {
  const ideas = await query(
    "SELECT id, md5(data::text) AS digest, false AS non_demo FROM public.ideas WHERE data->'demo'='true'::jsonb ORDER BY id",
  );
  const ideaIds = ideas.rows.map((row) => row.id as string);
  const roasts = await query(
    `SELECT t.id, md5(t.data::text) AS digest, NOT ${demoActor("authorId")} AS non_demo FROM public.roasts t WHERE t.data->>'ideaId'=ANY($1::text[]) ORDER BY t.id`,
    [ideaIds],
  );
  const roastIds = roasts.rows.map((row) => row.id as string);
  const targets = [...ideaIds, ...roastIds];
  const rows = {
    ideas: ideas.rows,
    roasts: roasts.rows,
  } as Record<CleanupTable, SelectedRow[]>;
  const selections = [
    [
      "replies",
      "t.data->>'ideaId'=ANY($1::text[]) OR t.data->>'roastId'=ANY($2::text[])",
      "authorId",
    ],
    ["reactions", "t.data->>'targetId'=ANY($3::text[])", "userId"],
    [
      "reports",
      "(t.data->>'targetType'='idea' AND t.data->>'targetId'=ANY($1::text[])) OR (t.data->>'targetType'='roast' AND t.data->>'targetId'=ANY($2::text[]))",
      "reporterId",
    ],
    ["notifications", "t.data->>'ideaId'=ANY($1::text[])", "actorId"],
    ["collaborations", "t.data->>'ideaId'=ANY($1::text[])", "authorId"],
    ["milestones", "t.data->>'ideaId'=ANY($1::text[])", "authorId"],
    ["improvements", "t.data->>'ideaId'=ANY($1::text[])", "authorId"],
    ["idea_revisions", "t.data->>'ideaId'=ANY($1::text[])", "authorId"],
  ] as const;
  for (const [table, condition, actor] of selections) {
    const nonDemo =
      table === "notifications"
        ? `NOT ${demoActor(actor)} OR NOT ${demoActor("userId")}`
        : `NOT ${demoActor(actor)}`;
    const result = await query(
      // The typed arguments CTE lets every selection use one fixed parameter shape.
      `WITH args AS (SELECT $1::text[] AS ideas, $2::text[] AS roasts, $3::text[] AS targets) SELECT t.id, md5(t.data::text) AS digest, (${nonDemo}) AS non_demo FROM public.${table} t CROSS JOIN args WHERE ${condition} ORDER BY t.id`,
      [ideaIds, roastIds, targets],
    );
    rows[table] = result.rows as SelectedRow[];
  }
  const orders = await query(
    "SELECT id FROM public.coffee_orders WHERE data->>'ideaId'=ANY($1::text[])",
    [ideaIds],
  );
  const events = await query(
    "SELECT count(*)::int AS count FROM public.payment_events WHERE data->>'ideaId'=ANY($1::text[]) OR data->>'orderId'=ANY($2::text[]) OR data->>'coffeeOrderId'=ANY($2::text[])",
    [ideaIds, orders.rows.map((row) => row.id)],
  );
  const counts = Object.fromEntries(
    deletionOrder.map((table) => [table, rows[table].length]),
  ) as Counts;
  const nonDemoInteractions = Object.fromEntries(
    deletionOrder.map((table) => [
      table,
      rows[table].filter((row) => row.non_demo).length,
    ]),
  ) as Counts;
  const blockers = {
    coffeeOrders: orders.rows.length,
    paymentEvents: events.rows[0].count as number,
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ rows, blockers }))
    .digest("hex");
  return {
    rows,
    plan: {
      ideaIds,
      counts,
      nonDemoInteractions,
      blockers,
      fingerprint,
      preservedTables: [...preservedTables],
    },
  };
}

/** Read-only snapshot. This never removes records or changes relationships. */
export async function planDemoCleanup(): Promise<DemoCleanupPlan> {
  return transaction(async () => {
    await query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    return (await selectCleanup()).plan;
  });
}

/** Explicit destructive operation; callers must review and confirm the exact plan. */
export async function applyDemoCleanup(
  expectedPlan: DemoCleanupPlan,
): Promise<DemoCleanupPlan> {
  if (!expectedPlan?.fingerprint || !Array.isArray(expectedPlan.ideaIds))
    throw new Error("Review a demo cleanup plan before applying it.");
  return transaction(async () => {
    await query("SET LOCAL lock_timeout='5s'");
    await query("SET LOCAL statement_timeout='30s'");
    // Block concurrent writes while resolving both FK-backed and logical links.
    // Readers remain available. The timeout prevents waiting indefinitely.
    await query(
      `LOCK TABLE ${[...deletionOrder, "profiles", "coffee_orders", "payment_events"].map((table) => `public.${table}`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const { plan, rows } = await selectCleanup();
    if (
      plan.fingerprint !== expectedPlan.fingerprint ||
      JSON.stringify(plan.ideaIds) !== JSON.stringify(expectedPlan.ideaIds) ||
      JSON.stringify(plan.counts) !== JSON.stringify(expectedPlan.counts) ||
      JSON.stringify(plan.nonDemoInteractions) !==
        JSON.stringify(expectedPlan.nonDemoInteractions)
    )
      throw new Error(
        "Demo data changed after preview. Review a new cleanup plan before applying.",
      );
    if (plan.blockers.coffeeOrders || plan.blockers.paymentEvents)
      throw new Error(
        "Cleanup blocked: historical payment records reference these demo ideas. Preserve and review those records before removal.",
      );
    for (const table of deletionOrder) {
      await query(`DELETE FROM public.${table} WHERE id=ANY($1::text[])`, [
        rows[table].map((row) => row.id),
      ]);
    }
    return plan;
  });
}
