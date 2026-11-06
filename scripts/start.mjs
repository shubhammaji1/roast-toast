import { spawn } from "node:child_process";
import { resolve } from "node:path";
// `npm start` must fail closed when production services are missing. Running a
// built frontend must never silently enable the development auth/payment mode.
const env = { ...process.env, NODE_ENV: "production" };
const api = spawn(process.execPath, ["apps/api/dist/server.js"], {
  env,
  stdio: "inherit",
  windowsHide: true,
});
const web = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "start", "-p", "3000"],
  { cwd: resolve("apps/web"), env, stdio: "inherit", windowsHide: true },
);
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  const children = [api, web];
  const exits = children.map((child) =>
    child.exitCode !== null || child.signalCode !== null || !child.pid
      ? Promise.resolve()
      : new Promise((done) => child.once("exit", done)),
  );
  const deadline = setTimeout(() => {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    process.exit(1);
  }, 20000);
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
  await Promise.all(exits);
  clearTimeout(deadline);
  process.exit(code);
}
api.on("error", (error) => {
  console.error(error.message);
  close(1);
});
web.on("error", (error) => {
  console.error(error.message);
  close(1);
});
api.on("exit", (code) => close(code ?? 1));
web.on("exit", (code) => close(code ?? 1));
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
