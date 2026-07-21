// claude.ai admin console から手動で読み取った 30 名の現行 tier を
// users テーブルに upsert する。メアドと seat_type だけを管理し、
// display_name / name などの他カラムには触れない。
//
// 使い方（本番）:
//   ssh conoha-deploy 'cd /var/www/app/claude-team-usage/current \
//     && set -a && . /var/www/_shared/apps/app-claude-team-usage.env && set +a \
//     && node scripts/seed-current-seats.mjs'
//
// dry-run:
//   DATABASE_URL=... node scripts/seed-current-seats.mjs --dry-run

import pg from "pg";

const { Pool } = pg;

// [email, seatType] — seatType は 'premium' | 'standard' | null (未割り当て)
const SEATS = [
  // Premium (9)
  ["kashiwagi@instyle.group", "premium"],
  ["sasaki-ta@instyle.group", "premium"],
  ["nakano@instyle.group", "premium"],
  ["wakasugi@instyle.group", "premium"],
  ["wada@instyle.group", "premium"],
  ["yasuda-re@instyle.group", "premium"],
  ["yamada@instyle.group", "premium"],
  ["tanabe@instyle.group", "premium"],
  ["tajimi@mebiusseiyaku.co.jp", "premium"],
  // Standard (20)
  ["horiuchi-eri@instyle.group", "standard"],
  ["hasegawa@instyle.group", "standard"],
  ["ozaki@instyle.group", "standard"],
  ["nakamura@instyle.group", "standard"],
  ["nitta@instyle.group", "standard"],
  ["takano@instyle.group", "standard"],
  ["itaco@instyle.group", "standard"],
  ["abe-ya@instyle.group", "standard"],
  ["yamamoto@instyle.group", "standard"],
  ["komiya@instyle.group", "standard"],
  ["chikaoka@instyle.group", "standard"],
  ["kobatake@instyle.group", "standard"],
  ["narita@instyle.group", "standard"],
  ["oishi@instyle.group", "standard"],
  ["taguchi@instyle.group", "standard"],
  ["inoue@instyle.group", "standard"],
  ["masaki@mebiusseiyaku.co.jp", "standard"],
  ["nakazawa-mi@mebiusseiyaku.co.jp", "standard"],
  ["tsumoto@mebiusseiyaku.co.jp", "standard"],
  ["suzuki-yuka@mebiusseiyaku.co.jp", "standard"],
  // 未割り当て (1)
  ["takagiwa@instyle.group", null],
];

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // email の小文字化 + 重複チェック
  const rows = SEATS.map(([email, seatType]) => [email.toLowerCase(), seatType]);
  const emails = rows.map(([e]) => e);
  const dup = emails.filter((e, i) => emails.indexOf(e) !== i);
  if (dup.length) throw new Error(`duplicate emails: ${dup.join(", ")}`);

  console.log(`[seed-current-seats] ${rows.length} rows`);
  console.log(
    `  premium=${rows.filter((r) => r[1] === "premium").length} ` +
      `standard=${rows.filter((r) => r[1] === "standard").length} ` +
      `unassigned=${rows.filter((r) => r[1] === null).length}`
  );

  if (DRY_RUN) {
    console.log("[dry-run] SQL preview:");
    for (const [email, seatType] of rows) {
      console.log(
        `  INSERT INTO "user"(id, email, seat_type) VALUES(gen_random_uuid()::text, '${email}', ${seatType === null ? "NULL" : `'${seatType}'`})`
      );
    }
    return;
  }

  const pool = new Pool({
    connectionString: url,
    ssl:
      url.includes("sslmode=require") || url.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
    max: 1,
  });

  try {
    let inserted = 0;
    let updated = 0;
    for (const [email, seatType] of rows) {
      // gen_random_uuid() は pgcrypto に依存。schema の $defaultFn は
      // アプリ層の crypto.randomUUID() 経由なので、SQL 直接投入では
      // node の crypto を使って id を生成する。
      const id = crypto.randomUUID();
      const res = await pool.query(
        `INSERT INTO "user" (id, email, seat_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET seat_type = EXCLUDED.seat_type
         RETURNING (xmax = 0) AS inserted`,
        [id, email, seatType]
      );
      if (res.rows[0]?.inserted) inserted++;
      else updated++;
    }
    console.log(`[seed-current-seats] done: inserted=${inserted} updated=${updated}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
