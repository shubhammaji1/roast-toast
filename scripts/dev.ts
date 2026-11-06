import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const temp = resolve(".data/tmp");
await mkdir(temp, { recursive: true });
process.env.TEMP = temp;
process.env.TMP = temp;
process.env.TMPDIR = temp;
const env = { ...process.env };
const api = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "watch", "apps/api/src/server.ts"],
  { env, stdio: "inherit", windowsHide: true },
);
const web = spawn(
  process.execPath,
  ["../../node_modules/next/dist/bin/next", "dev", "--webpack", "-p", "3000"],
  { cwd: resolve("apps/web"), env, stdio: "inherit", windowsHide: true },
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exit(0);
}
api.on("exit", () => {
  if (!closing) void close();
});
web.on("exit", () => {
  if (!closing) void close();
});
process.on("SIGINT", close);
process.on("SIGTERM", close);
