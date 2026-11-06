import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";
import type { Store, Options } from "express-rate-limit";

let redis: Redis | undefined;
let mailQueue: Queue | undefined;
let mailWorker: Worker | undefined;
let workerRedis: Redis | undefined;
export function getRedis() {
  if (!process.env.REDIS_URL) return undefined;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 5000,
      enableOfflineQueue: false,
      enableReadyCheck: true,
    });
    redis.on("error", (error) =>
      console.error("Redis connection error:", error.name),
    );
  }
  return redis;
}
export async function ensureRedisReady(timeoutMs = 5000) {
  const connection = getRedis();
  if (!connection) return;
  if (connection.status !== "ready") {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        connection.off("ready", ready);
        connection.off("error", failed);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(
          new Error("Redis is unavailable. Check REDIS_URL and connectivity."),
        );
      };
      const timer = setTimeout(failed, timeoutMs);
      connection.once("ready", ready);
      connection.once("error", failed);
    });
  }
  try {
    await connection.ping();
  } catch {
    throw new Error("Redis is unavailable. Check REDIS_URL and connectivity.");
  }
}
export function sharedRateStore(namespace: string): Store | undefined {
  const connection = getRedis();
  if (!connection) return;
  let windowMs = 60000;
  const key = (value: string) => `rt:limit:v1:${namespace}:${value}`;
  return {
    init(options: Options) {
      windowMs = options.windowMs;
    },
    async increment(value: string) {
      const [totalHits, ttl] = (await connection.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return {n,redis.call('PTTL',KEYS[1])}",
        1,
        key(value),
        String(windowMs),
      )) as [number, number];
      return { totalHits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
    },
    async decrement(value: string) {
      await connection.decr(key(value));
    },
    async resetKey(value: string) {
      await connection.del(key(value));
    },
  };
}
export async function initializeEmail() {
  const connection = getRedis();
  if (!process.env.SMTP_URL || !connection || mailQueue) return;
  await ensureRedisReady();
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  if (!mailQueue) {
    mailQueue = new Queue("rt-email", {
      connection: connection as any,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: { age: 86400, count: 100 },
      },
    });
    mailQueue.on("error", (error) =>
      console.error("Email queue error:", error.name),
    );
    workerRedis = connection.duplicate({
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      // Blocking worker reads can legitimately wait longer than API commands.
      commandTimeout: undefined,
    });
    workerRedis.on("error", (error) =>
      console.error("Email worker connection error:", error.name),
    );
    mailWorker = new Worker(
      "rt-email",
      async (job) => {
        await transport.sendMail({ from: process.env.EMAIL_FROM, ...job.data });
      },
      { connection: workerRedis as any, concurrency: 3 },
    );
    mailWorker.on("failed", (_job, error) =>
      console.error("Email delivery failed:", error.name),
    );
    mailWorker.on("error", (error) =>
      console.error("Email worker error:", error.name),
    );
  }
}
export async function deliverEmail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!process.env.SMTP_URL) throw new Error("SMTP is not configured.");
  await initializeEmail();
  if (mailQueue) await mailQueue.add("send", message);
  else
    await nodemailer
      .createTransport(process.env.SMTP_URL)
      .sendMail({ from: process.env.EMAIL_FROM, ...message });
}
export async function closeInfrastructure() {
  await mailWorker?.close();
  await mailQueue?.close();
  await workerRedis?.quit();
  await redis?.quit();
}
