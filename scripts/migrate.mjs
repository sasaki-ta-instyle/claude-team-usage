// Apply drizzle migrations against DATABASE_URL.
// Plain Node ESM (no tsx) so it runs on the ConoHa standalone host where only
// runtime-traced deps are available. Drizzle migrator + pg are already pulled
// in by the app code, so they're in .next/standalone/node_modules.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({
    connectionString,
    ssl:
      connectionString.includes("sslmode=require") ||
      connectionString.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
    max: 1,
  });
  const db = drizzle(pool);

  console.log("Running migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
