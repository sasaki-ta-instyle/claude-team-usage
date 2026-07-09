// Neon の現状を可視化する診断スクリプト。
// 使い方: サーバ内で env を読み込んでから実行。
//   ssh conoha-deploy 'cd /var/www/app/claude-team-usage/current \
//     && set -a && . /var/www/_shared/apps/app-claude-team-usage.env && set +a \
//     && node scripts/db-stats.mjs'

import pg from "pg";

const { Pool } = pg;

function fmt(rows) {
  if (!rows.length) return "(no rows)";
  const cols = Object.keys(rows[0]);
  const widths = cols.map(
    (c) =>
      Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length))
  );
  const line = cols.map((c, i) => c.padEnd(widths[i])).join(" | ");
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const body = rows
    .map((r) =>
      cols.map((c, i) => String(r[c] ?? "").padEnd(widths[i])).join(" | ")
    )
    .join("\n");
  return `${line}\n${sep}\n${body}`;
}

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
  const q = async (sql) => (await pool.query(sql)).rows;

  try {
    console.log("=== DB size ===");
    console.log(
      fmt(
        await q(`
          SELECT
            pg_size_pretty(pg_database_size(current_database())) AS db_size,
            current_database() AS db_name
        `)
      )
    );

    console.log("\n=== cowork_events 全体 ===");
    console.log(
      fmt(
        await q(`
          SELECT
            count(*)::bigint AS rows,
            pg_size_pretty(pg_relation_size('cowork_events')) AS heap_size,
            pg_size_pretty(pg_total_relation_size('cowork_events')) AS total_size,
            min(occurred_at) AS min_ts,
            max(occurred_at) AS max_ts
          FROM cowork_events
        `)
      )
    );

    console.log("\n=== cowork_events 月別 (JST) ===");
    console.log(
      fmt(
        await q(`
          SELECT
            to_char((occurred_at AT TIME ZONE 'Asia/Tokyo'), 'YYYY-MM') AS month,
            count(*)::bigint AS rows,
            pg_size_pretty(
              sum(pg_column_size(raw))::bigint
            ) AS raw_bytes
          FROM cowork_events
          GROUP BY 1
          ORDER BY 1
        `)
      )
    );

    console.log("\n=== cowork_events 大きいテーブル TOP 10 (全 relation) ===");
    console.log(
      fmt(
        await q(`
          SELECT
            relname,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
            pg_size_pretty(pg_relation_size(c.oid)) AS heap_size
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
          ORDER BY pg_total_relation_size(c.oid) DESC
          LIMIT 10
        `)
      )
    );

    console.log("\n=== sync_log ===");
    console.log(
      fmt(
        await q(
          `SELECT count(*)::bigint AS rows, min(ran_at) AS min_ts, max(ran_at) AS max_ts FROM sync_log`
        )
      )
    );

    // 削除シミュレーション
    console.log("\n=== 削除シミュレーション (JST 月初境界) ===");
    console.log(
      fmt(
        await q(`
          SELECT
            'now (bufferなし = 当月月初)' AS scenario,
            count(*)::bigint AS deletable
          FROM cowork_events
          WHERE occurred_at < date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'
          UNION ALL
          SELECT
            '前月まで残す (通常運用)' AS scenario,
            count(*)::bigint AS deletable
          FROM cowork_events
          WHERE occurred_at < (date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo') - interval '1 month') AT TIME ZONE 'Asia/Tokyo'
        `)
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
