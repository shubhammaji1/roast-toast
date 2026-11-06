import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

export type Executor = {
  query: (
    text: string,
    values?: any[],
  ) => Promise<{ rows: any[]; rowCount?: number | null }>;
};
type Client = Executor & { release: () => void };
export type DatabasePool = Executor & {
  connect: () => Promise<Client>;
  end: () => Promise<void>;
};
let pool: DatabasePool | undefined;
const scope = new AsyncLocalStorage<Executor>();
export function getPool() {
  if (!pool)
    throw new Error("Database is not connected. Configure SUPABASE_DB_URL.");
  return pool;
}
export function query(text: string, values: any[] = []) {
  return (scope.getStore() || getPool()).query(text, values);
}
export async function transaction<T>(
  work: (session: Executor) => Promise<T>,
): Promise<T> {
  const existing = scope.getStore();
  if (existing) return work(existing);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await scope.run(client, () => work(client));
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function migrateDatabase() {
  const sql = await readFile(
    new URL(
      "../../../supabase/migrations/202611060001_community.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(718421)");
    await client.query(sql);
  });
}
export async function connectDatabase() {
  const uri = process.env.SUPABASE_DB_URL;
  if (!uri)
    throw new Error(
      "Set SUPABASE_DB_URL in .env using the Supabase dashboard Connect → Session pooler connection string. Run npm run db:migrate before starting.",
    );
  const url = new URL(uri);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("SUPABASE_DB_URL must be a PostgreSQL connection string.");
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  // Configure TLS ourselves so URI options cannot silently disable certificate checks.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  const connectionPool = new Pool({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 15000,
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(process.env.SUPABASE_DB_CA
            ? { ca: await readFile(process.env.SUPABASE_DB_CA, "utf8") }
            : {}),
        },
  });
  connectionPool.on("error", (error) =>
    console.error("PostgreSQL idle connection error:", error.name),
  );
  pool = connectionPool;
  await query("SELECT 1");
  return {
    db: pool,
    close: async () => {
      await pool?.end();
      pool = undefined;
    },
  };
}
// Injected only by tests: production always connects to the configured Supabase PostgreSQL server.
export function useTestDatabase(value: DatabasePool) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Test database is unavailable in production.");
  pool = value;
}
