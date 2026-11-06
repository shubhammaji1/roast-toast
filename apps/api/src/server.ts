import { connectDatabase } from "./database.js";
import { createAuth } from "./auth.js";
import { createApp } from "./app.js";
import { seedDemo } from "./seed.js";
import { closeInfrastructure } from "./infrastructure.js";

const database = await connectDatabase();
const auth = await createAuth(database.db);
await seedDemo();
const app = await createApp(auth);
const port = Number(process.env.API_PORT || 4000);
const host = process.env.API_HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("API_PORT must be an integer between 1 and 65535.");
const server = app.listen(port, host, () =>
  console.log(`Roast & Toast API: http://localhost:${port}`),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 15000);
  deadline.unref();
  try {
    await new Promise<void>((done, fail) =>
      server.close((error) => (error ? fail(error) : done())),
    );
    await closeInfrastructure();
    await database.close();
    clearTimeout(deadline);
    process.exit(0);
  } catch (error) {
    console.error(
      "API shutdown failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    process.exit(1);
  }
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
