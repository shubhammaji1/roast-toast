import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { connectDatabase } from "../apps/api/src/database.js";
import {
  applyDemoCleanup,
  planDemoCleanup,
  type DemoCleanupPlan,
} from "../apps/api/src/demo-cleanup.js";

const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--apply") || args.length > 1)
  throw new Error(
    "Use db:demo:plan to preview, or db:demo:clean to apply the saved plan.",
  );
const apply = args.includes("--apply");
const planFile = resolve(".data/demo-cleanup-plan.json");
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;
try {
  database = await connectDatabase();
  const connection = new URL(process.env.SUPABASE_DB_URL!);
  const databaseFingerprint = createHash("sha256")
    .update(`${connection.host}${connection.pathname}\0${connection.username}`)
    .digest("hex");
  if (apply) {
    const snapshot = JSON.parse(await readFile(planFile, "utf8")) as {
      databaseFingerprint: string;
      plan: DemoCleanupPlan;
    };
    if (snapshot.databaseFingerprint !== databaseFingerprint)
      throw new Error(
        "The database differs from the saved preview. Create and review a new cleanup plan.",
      );
    const result = await applyDemoCleanup(snapshot.plan);
    console.log("Demo cleanup completed. Removed rows:");
    console.log(JSON.stringify(result, null, 2));
  } else {
    const plan = await planDemoCleanup();
    await mkdir(resolve(".data"), { recursive: true });
    await writeFile(
      planFile,
      JSON.stringify({ databaseFingerprint, plan }, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log("Demo cleanup preview:");
    console.log(JSON.stringify(plan, null, 2));
    console.log(
      "Review the saved plan at .data/demo-cleanup-plan.json before applying it.",
    );
  }
} catch (error) {
  const code =
    typeof error === "object" && error && "code" in error
      ? error.code
      : undefined;
  const message = error instanceof Error ? error.message : "Unknown error";
  // PostgreSQL/connection errors can contain server details; keep those private.
  console.error(
    code
      ? `Demo cleanup failed (${String(code)}). Check database connectivity and the saved plan.`
      : message.includes("postgresql://") || message.includes("postgres://")
        ? "Demo cleanup failed. Check the server-only database configuration."
        : message,
  );
  process.exitCode = 1;
} finally {
  await database?.close();
}
