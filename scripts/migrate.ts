import { connectDatabase, migrateDatabase } from "../apps/api/src/database.js";
const database = await connectDatabase();
try {
  await migrateDatabase();
  console.log("Supabase PostgreSQL schema is ready.");
} finally {
  await database.close();
}
