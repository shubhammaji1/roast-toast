import { betterAuth } from "better-auth";

import type { DatabasePool } from "./database.js";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { EmailMessage } from "./models.js";
import {
  deliverEmail,
  ensureRedisReady,
  getRedis,
  initializeEmail,
} from "./infrastructure.js";

async function secret() {
  if (
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_SECRET.length >= 32
  )
    return process.env.BETTER_AUTH_SECRET;
  if (process.env.NODE_ENV === "production")
    throw new Error("Set a unique BETTER_AUTH_SECRET (32+ characters).");
  await mkdir(".data", { recursive: true });
  try {
    return await readFile(".data/auth-secret", "utf8");
  } catch {
    const value = randomBytes(48).toString("hex");
    await writeFile(".data/auth-secret", value, { mode: 0o600 });
    return value;
  }
}
export async function createAuth(db: DatabasePool) {
  const production = process.env.NODE_ENV === "production";
  if (production && !process.env.APP_ORIGIN?.startsWith("https://"))
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  const redis = getRedis();
  if (production && !redis)
    throw new Error(
      "Production requires REDIS_URL for shared abuse limits and durable email retries.",
    );
  await ensureRedisReady();
  await initializeEmail();
  const send = async (to: string, subject: string, url: string) => {
    const text = `${subject}\n\n${url}\n\nIf you did not request this, you can ignore this email.`;
    if (process.env.SMTP_URL) await deliverEmail({ to, subject, text });
    else if (!production) await EmailMessage.create({ to, subject, text });
    else throw new Error("Email transport is not configured.");
  };
  return betterAuth({
    appName: "Roast & Toast",
    basePath: "/api/v1/auth",
    baseURL: process.env.APP_ORIGIN || "http://localhost:3000",
    secret: await secret(),
    database: db as any,
    trustedOrigins: [process.env.APP_ORIGIN || "http://localhost:3000"],
    secondaryStorage: redis
      ? {
          get: async (key) => redis.get(`rt:auth:${key}`),
          getAndDelete: async (key) => redis.getdel(`rt:auth:${key}`),
          increment: async (key, ttl) =>
            Number(
              await redis.eval(
                "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
                1,
                `rt:auth:${key}`,
                String(ttl),
              ),
            ),
          set: async (key, value, ttl) => {
            if (ttl) await redis.set(`rt:auth:${key}`, value, "EX", ttl);
            else await redis.set(`rt:auth:${key}`, value);
          },
          delete: async (key) => {
            await redis.del(`rt:auth:${key}`);
          },
        }
      : undefined,
    emailAndPassword: {
      enabled: !production || Boolean(process.env.SMTP_URL),
      minPasswordLength: 12,
      requireEmailVerification: production,
      sendResetPassword: async ({ user, url }) =>
        send(user.email, "Reset your Roast & Toast password", url),
    },
    emailVerification: {
      sendOnSignUp: process.env.NODE_ENV !== "test",
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        send(user.email, "Verify your Roast & Toast email", url),
    },
    user: { deleteUser: { enabled: false } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 50,
      storage: redis ? "secondary-storage" : "database",
    },
    advanced: {
      useSecureCookies: production,
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      ipAddress: { ipAddressHeaders: ["x-rt-client-ip"] },
    },
    socialProviders:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : undefined,
  });
}
export type Auth = Awaited<ReturnType<typeof createAuth>>;
