import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
// Two Next dev servers in the same directory repeatedly overwrite next-env.d.ts.
// Test an exact source copy so the user's running preview remains independent.
const project = resolve(".data/e2e-web");
await mkdir(project, { recursive: true });
for (const name of [
  "src",
  "package.json",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "postcss.config.mjs",
]) {
  await cp(resolve("apps/web", name), resolve(project, name), {
    recursive: true,
    force: true,
  });
}
const env = {
  ...process.env,
  API_INTERNAL_URL: "http://127.0.0.1:4001",
  NODE_ENV: "development",
};
delete env.NEXT_DIST_DIR;
const child = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "-p",
    "3001",
  ],
  { cwd: project, env, stdio: "inherit", windowsHide: true },
);
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
