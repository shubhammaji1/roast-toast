import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  status: "ready",
  ping: vi.fn(),
  connection: null as any,
  duplicateOptions: null as any,
  worker: null as any,
}));
vi.mock("ioredis", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    Redis: class extends EventEmitter {
      status = state.status;
      ping = state.ping;
      constructor() {
        super();
        state.connection = this;
      }
      duplicate(options: any) {
        state.duplicateOptions = options;
        return new (this.constructor as any)();
      }
    },
  };
});
vi.mock("bullmq", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    Queue: class extends EventEmitter {},
    Worker: class extends EventEmitter {
      constructor() {
        super();
        state.worker = this;
      }
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
  state.status = "ready";
  state.ping.mockReset().mockResolvedValue("PONG");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("does not connect when Redis is unconfigured in development", async () => {
  vi.stubEnv("REDIS_URL", "");
  const { ensureRedisReady } = await import("../apps/api/src/infrastructure");
  await ensureRedisReady();
  expect(state.ping).not.toHaveBeenCalled();
});

it("checks a ready connection before allowing startup", async () => {
  const { ensureRedisReady } = await import("../apps/api/src/infrastructure");
  await ensureRedisReady();
  expect(state.ping).toHaveBeenCalledOnce();
});

it("waits for Redis readiness and removes temporary listeners", async () => {
  state.status = "connecting";
  const { ensureRedisReady } = await import("../apps/api/src/infrastructure");
  const ready = ensureRedisReady();
  expect(state.ping).not.toHaveBeenCalled();
  state.connection.status = "ready";
  state.connection.emit("ready");
  await ready;
  expect(state.ping).toHaveBeenCalledOnce();
  expect(state.connection.listenerCount("ready")).toBe(0);
  expect(state.connection.listenerCount("error")).toBe(1);
});

it("fails startup on connection errors without exposing connection details", async () => {
  state.status = "connecting";
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { ensureRedisReady } = await import("../apps/api/src/infrastructure");
  const ready = ensureRedisReady();
  const rejected = expect(ready).rejects.toThrow("Redis is unavailable.");
  state.connection.emit("error", new Error("private connection details"));
  await rejected;
  expect(log).toHaveBeenCalledWith("Redis connection error:", "Error");
  expect(state.connection.listenerCount("ready")).toBe(0);
});

it("bounds startup when a Redis connection never becomes ready", async () => {
  vi.useFakeTimers();
  state.status = "connecting";
  const { ensureRedisReady } = await import("../apps/api/src/infrastructure");
  const rejected = expect(ensureRedisReady(25)).rejects.toThrow(
    "Redis is unavailable.",
  );
  await vi.advanceTimersByTimeAsync(25);
  await rejected;
  expect(state.connection.listenerCount("ready")).toBe(0);
});

it("fails startup when an established connection cannot answer commands", async () => {
  state.ping.mockRejectedValue(new Error("private connection details"));
  const { ensureRedisReady } = await import("../apps/api/src/infrastructure");
  await expect(ensureRedisReady()).rejects.toThrow("Redis is unavailable.");
});

it("allows blocking email-worker reads and handles worker errors without a crash", async () => {
  vi.stubEnv("SMTP_URL", "smtp://127.0.0.1:1025");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { initializeEmail } = await import("../apps/api/src/infrastructure");
  await initializeEmail();
  expect(state.duplicateOptions).toHaveProperty("commandTimeout", undefined);
  expect(state.duplicateOptions.maxRetriesPerRequest).toBeNull();
  state.worker.emit("error", new Error("private connection details"));
  expect(log).toHaveBeenCalledWith("Email worker error:", "Error");
});
