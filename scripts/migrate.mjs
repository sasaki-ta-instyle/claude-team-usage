// Minimal drizzle-compatible migrator that depends ONLY on `pg`.
// Next.js standalone build traces dependencies from server entrypoints, so
// drizzle-orm/migrator is NOT bundled. We reimplement the small slice we need:
// read drizzle/*.sql, split on `--> statement-breakpoint`, apply atomically,
// record the migration in `__schema_migrations`.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({
    connectionString: url,
    ssl:
      url.includes("sslmode=require") || url.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
    max: 1,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS __schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const dir = path.resolve("drizzle");
    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const id = file.replace(/\.sql$/, "");
      const { rowCount } = await pool.query(
        "SELECT 1 FROM __schema_migrations WHERE id = $1",
        [id]
      );
      if (rowCount && rowCount > 0) {
        console.log(`skip ${id} (already applied)`);
        continue;
      }

      const sql = await readFile(path.join(dir, file), "utf8");
      const stmts = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const stmt of stmts) {
          await client.query(stmt);
        }
        await client.query(
          "INSERT INTO __schema_migrations (id) VALUES ($1)",
          [id]
        );
        await client.query("COMMIT");
        console.log(`applied ${id} (${stmts.length} statements)`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    console.log("Migrations done.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
