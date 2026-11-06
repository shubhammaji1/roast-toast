import { testDatabase } from "./postgres";
import { createAuth } from "../apps/api/src/auth";
import { createApp } from "../apps/api/src/app";
import { seedDemo } from "../apps/api/src/seed";
process.env.NODE_ENV = "test";
process.env.APP_ORIGIN = "http://localhost:3001";
process.env.BETTER_AUTH_SECRET =
  "isolated-browser-tests-only-secret-32-characters";
const database = await testDatabase();
await seedDemo({ enabled: true });
const app = await createApp(await createAuth(database.pool));
const server = app.listen(4001, "127.0.0.1", () =>
  console.log("Isolated PostgreSQL browser-test API ready."),
);
async function close() {
  server.close();
  await database.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
