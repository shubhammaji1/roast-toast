import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["apps/api/src/server.ts"],
  outDir: "apps/api/dist",
  format: ["esm"],
  target: "node22",
  packages: "external",
  noExternal: ["@roast/domain"],
  sourcemap: true,
});
