import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// DrizzleAdapter for Auth.js sniffs the db instance shape at module load, so
// we always construct a real drizzle handle even when no DATABASE_URL is
// configured. In PREVIEW / build-time contexts we fall back to a localhost
// placeholder URL that the Pool will never actually connect to (queries
// short-circuit on PREVIEW before touching the pool).
const PLACEHOLDER = "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";
const connectionString = process.env.DATABASE_URL || PLACEHOLDER;

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
  // eslint-disable-next-line no-console
  console.warn(
    "[db] DATABASE_URL is not set; using placeholder. Queries will fail unless PREVIEW=1."
  );
}

const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPool.pgPool ??
  new Pool({
    connectionString,
    ssl:
      connectionString.includes("sslmode=require") ||
      connectionString.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForPool.pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
