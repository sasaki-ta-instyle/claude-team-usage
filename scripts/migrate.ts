// Run drizzle migrations against the configured DATABASE_URL.
// Executed during ConoHa deploy (USE_DB=true → pnpm migrate).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

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
