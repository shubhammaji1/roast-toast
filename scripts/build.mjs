import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const temp = resolve(".data/tmp");
await mkdir(temp, { recursive: true });
const env = {
  ...process.env,
  NODE_ENV: "production",
  TEMP: temp,
  TMP: temp,
  TMPDIR: temp,
};
async function run(file, args, cwd) {
  await new Promise((done, fail) => {
    const child = spawn(process.execPath, [resolve(file), ...args], {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0
        ? done()
        : fail(new Error("Build command failed with exit code " + code)),
    );
  });
}
await run(
  "node_modules/next/dist/bin/next",
  ["build", "--webpack"],
  resolve("apps/web"),
);
await run(
  "node_modules/tsup/dist/cli-default.js",
  ["--config", "tsup.config.ts"],
  process.cwd(),
);
