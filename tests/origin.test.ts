import { afterEach, expect, it, vi } from "vitest";
import { applicationOrigin } from "../apps/api/src/origin";

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, ""])(
  "defaults an unconfigured application origin (%j) to local development",
  (value) => {
    vi.stubEnv("APP_ORIGIN", value);
    expect(applicationOrigin()).toBe("http://localhost:3000");
  },
);

it.each([
  [
    "https://roast-and-toast-ebon.vercel.app/",
    "https://roast-and-toast-ebon.vercel.app",
  ],
  ["  https://example.test/  ", "https://example.test"],
  ["https://EXAMPLE.test:443/", "https://example.test"],
  ["http://localhost:80/", "http://localhost"],
  ["http://localhost:3001/", "http://localhost:3001"],
  ["https://example.test:8443/", "https://example.test:8443"],
  ["http://[::1]:3000/", "http://[::1]:3000"],
])("normalizes configured origin %j to %j", (configured, canonical) => {
  vi.stubEnv("APP_ORIGIN", configured);
  expect(applicationOrigin()).toBe(canonical);
});

it.each([
  "https://",
  "example.test",
  "ftp://example.test/",
  "file:///tmp/app",
  "javascript:alert(1)",
  "https://user:password@example.test/",
  "https://user@example.test/",
  "https://example.test/app",
  "https://example.test//",
  "https://example.test/?redirect=elsewhere",
  "https://example.test/#section",
])("rejects an invalid or non-origin APP_ORIGIN value %j", (configured) => {
  vi.stubEnv("APP_ORIGIN", configured);
  expect(() => applicationOrigin()).toThrow();
});
