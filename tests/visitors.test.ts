import { afterEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
const models = vi.hoisted(() => ({ session: vi.fn(), profile: vi.fn() }));
vi.mock("../apps/api/src/models", () => ({
  VisitorSession: { findOne: models.session },
  ProfileModel: { findOne: models.profile },
}));
vi.mock("../apps/api/src/database", () => ({ transaction: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

async function resolve(
  environment: string,
  origin: string,
  cookies: Record<string, string>,
) {
  vi.stubEnv("NODE_ENV", environment);
  vi.stubEnv("APP_ORIGIN", origin);
  const visitor = await import("../apps/api/src/visitors");
  const expiresAt = new Date(Date.now() + 60000);
  models.session.mockResolvedValue({ userId: "owner", expiresAt });
  models.profile.mockResolvedValue({ userId: "owner" });
  const response = { cookie: vi.fn(), clearCookie: vi.fn() };
  const identity = await visitor.resolveVisitor(
    { cookies } as Request,
    response as unknown as Response,
    false,
  );
  return { visitor, response, identity, expiresAt };
}
it("upgrades the cookie on HTTPS even with a development NODE_ENV, preserving the identity and expiry", async () => {
  const { response, identity, expiresAt } = await resolve(
    "development",
    "https://example.test",
    { "rt-visitor": "a".repeat(64) },
  );
  expect(identity?.profile.userId).toBe("owner");
  expect(response.cookie).toHaveBeenCalledWith(
    "rt-visitor",
    "a".repeat(64),
    expect.objectContaining({
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      expires: expiresAt,
    }),
  );
});
it("migrates a valid legacy cookie to the production host cookie", async () => {
  const { response, identity } = await resolve(
    "production",
    "https://example.test",
    { "rt-visitor": "a".repeat(64) },
  );
  expect(identity?.profile.userId).toBe("owner");
  expect(response.cookie).toHaveBeenCalledWith(
    "__Host-rt-visitor",
    "a".repeat(64),
    expect.objectContaining({ secure: true, path: "/" }),
  );
  expect(response.clearCookie).toHaveBeenCalledWith(
    "rt-visitor",
    expect.objectContaining({ path: "/" }),
  );
});
it("does not fall back to a legacy identity when a primary cookie is invalid", async () => {
  const { identity, response } = await resolve(
    "production",
    "https://example.test",
    { "__Host-rt-visitor": "invalid", "rt-visitor": "a".repeat(64) },
  );
  expect(identity).toBeNull();
  expect(models.session).not.toHaveBeenCalled();
  expect(response.cookie).not.toHaveBeenCalled();
});
it("keeps HTTP localhost usable for isolated development", async () => {
  const { response } = await resolve("development", "http://localhost:3000", {
    "rt-visitor": "a".repeat(64),
  });
  expect(response.cookie).toHaveBeenCalledWith(
    "rt-visitor",
    "a".repeat(64),
    expect.objectContaining({ secure: false }),
  );
});
it("clears both cookie names when deleting a production identity", async () => {
  const { visitor, response } = await resolve(
    "production",
    "https://example.test",
    {},
  );
  visitor.clearVisitor(response as unknown as Response);
  expect(response.clearCookie.mock.calls.map((call) => call[0])).toEqual([
    "__Host-rt-visitor",
    "rt-visitor",
  ]);
});
