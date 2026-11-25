import { query, transaction } from "./database.js";
import { EmailMessage, MilestoneModel } from "./models.js";
import { deliverEmail } from "./infrastructure.js";
import { clerkEmail } from "./clerk-auth.js";
import { applicationOrigin } from "./origin.js";

// Poll persisted deadlines so reminders survive server restarts. Row locks keep
// concurrent server instances from scheduling the same sprint simultaneously.
export async function sendSprintReminders(now = new Date()) {
  return transaction(async () => {
    const result = await query(
      `
      SELECT m.id, m.data, u.email, p.data->>'clerkUserId' AS clerk_user_id
      FROM milestones m
      JOIN ideas i ON i.id=m.data->>'ideaId'
      JOIN profiles p ON p.data->>'userId'=i.data->>'authorId'
      LEFT JOIN public."user" u ON u.id=COALESCE(p.data->>'accountId', p.data->>'userId')
      WHERE m.data->>'kind'='experiment' AND m.data->'sprint' IS NOT NULL
        AND COALESCE(m.data->>'status','Planned') NOT IN ('Complete','Inconclusive')
        AND m.data->>'reminderSentAt' IS NULL
        AND m.data->'sprint'->>'deadline' > $1
        AND m.data->'sprint'->>'deadline' <= $2
        AND p.data->>'sprintReminders'='true' AND (u."emailVerified"=true OR p.data->>'clerkUserId' IS NOT NULL)
        AND p.data->>'deletedAt' IS NULL AND COALESCE(p.data->>'suspended','false') <> 'true'
        AND i.data->>'deletedAt' IS NULL AND i.data->>'status' <> 'archived'
      ORDER BY m.data->'sprint'->>'deadline' LIMIT 50 FOR UPDATE OF m SKIP LOCKED`,
      [now.toISOString(), new Date(now.getTime() + 86400000).toISOString()],
    );
    for (const row of result.rows) {
      const email = row.clerk_user_id
        ? await clerkEmail(row.clerk_user_id)
        : row.email;
      if (!email) continue;
      const origin = applicationOrigin();
      const message = {
        to: email,
        subject: "Your seven-day sprint is ready for a decision",
        text: `Your sprint deadline is within 24 hours. Record what happened and decide whether to build, change, stop, or test again.\n\n${origin}/ideas/${row.data.ideaId}?tab=journey#sprint-${row.id}\n\nTurn off sprint reminders at ${origin}/account`,
      };
      if (process.env.SMTP_URL) await deliverEmail(message, `sprint-${row.id}`);
      else if (process.env.NODE_ENV !== "production")
        await EmailMessage.create(message);
      else continue;
      await MilestoneModel.updateOne(
        { _id: row.id },
        { $set: { reminderSentAt: now.toISOString() } },
      );
    }
    return result.rows.length;
  });
}

export function startSprintReminders() {
  let active: Promise<void> | undefined;
  const run = () => {
    if (active) return;
    active = sendSprintReminders()
      .then(() => {})
      .catch((error) => {
        console.error(
          "Sprint reminders failed:",
          error instanceof Error ? error.name : "Unknown error",
        );
      })
      .finally(() => {
        active = undefined;
      });
  };
  const timer = setInterval(() => void run(), 60000);
  timer.unref();
  void run();
  return async () => {
    clearInterval(timer);
    await active;
  };
}
