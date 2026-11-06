import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const temp = resolve(".data/tmp");
await mkdir(temp, { recursive: true });
const child = spawn(process.execPath, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp },
});
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
