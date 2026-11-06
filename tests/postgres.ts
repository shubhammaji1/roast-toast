import { PGlite } from "@electric-sql/pglite";
import {
  useTestDatabase,
  migrateDatabase,
  type DatabasePool,
} from "../apps/api/src/database";

/** Real embedded PostgreSQL for isolated tests; never a cloud/Supabase substitute in production. */
export async function testDatabase() {
  const db = new PGlite();
  let tail = Promise.resolve();
  async function connect() {
    let unlock!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;
    return {
      query: async (text: string, values: any[] = []) => {
        if (values.length === 0 && text.includes(";")) {
          await db.exec(text);
          return { rows: [], rowCount: 0 };
        }
        const result = await db.query(text, values);
        return { rows: result.rows as any[], rowCount: result.affectedRows };
      },
      release: () => unlock(),
    };
  }
  const pool: DatabasePool = {
    connect,
    query: async (text, values) => {
      const client = await connect();
      try {
        return await client.query(text, values);
      } finally {
        client.release();
      }
    },
    end: () => db.close(),
  };
  useTestDatabase(pool);
  await migrateDatabase();
  return { pool, close: () => pool.end() };
}
