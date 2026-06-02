import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// In PREVIEW mode we never actually query the DB, but the DrizzleAdapter for
// Auth.js sniffs the instance shape at module load, so we still need a real
// drizzle handle. Fall back to a localhost placeholder URL that's only ever
// constructed, never connected to.
const connectionString =
  process.env.DATABASE_URL ??
  (process.env.PREVIEW === "1"
    ? "postgres://preview:preview@127.0.0.1:5432/preview"
    : undefined);

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
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
