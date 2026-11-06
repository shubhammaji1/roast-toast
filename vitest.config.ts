import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
