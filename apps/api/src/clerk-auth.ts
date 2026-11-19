import { createClerkClient } from "@clerk/backend";
import type { Request as ExpressRequest } from "express";

export function clerkConfigured() {
  return Boolean(
    process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}
function client() {
  return createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
}
export async function clerkEmail(userId: string) {
  const user = await client().users.getUser(userId).catch((error: unknown) => {
    if (typeof error === "object" && error && "status" in error && error.status === 404) return null;
    throw error;
  });
  if (!user) return null;
  if (user.banned || user.locked) return null;
  const email = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return email?.verification?.status === "verified" ? email.emailAddress : null;
}
export async function resolveClerk(req: ExpressRequest) {
  if (!clerkConfigured()) return null;
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers))
    if (typeof value === "string") headers.set(key, value);
  const sdk = client();
  const state = await sdk.authenticateRequest(
    new Request(new URL(req.originalUrl, origin), {
      headers,
      method: req.method,
    }),
    { authorizedParties: [origin], acceptsToken: "session_token" },
  );
  const auth = state.toAuth();
  if (!auth?.userId || !auth.sessionId) return null;
  const [user, session] = await Promise.all([
    sdk.users.getUser(auth.userId),
    sdk.sessions.getSession(auth.sessionId),
  ]);
  if (user.banned || user.locked || session.status !== "active")
    throw Object.assign(
      new Error("This sign-in session is no longer available. Sign in again."),
      { status: 401 },
    );
  const email = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  return {
    clerkUserId: user.id,
    user: {
      id: `clerk_${user.id}`,
      name:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.username ||
        "Maker",
      email: email?.emailAddress || "",
      emailVerified: email?.verification?.status === "verified",
    },
    session: { createdAt: new Date(session.createdAt) },
  };
}
export async function deleteClerkUser(userId: string) {
  await client().users.deleteUser(userId);
}
