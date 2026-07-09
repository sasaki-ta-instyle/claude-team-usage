// 月次レポート HTML を生成 → 本番 /html/ に転送 → Neon から前々月の
// cowork_events を削除するスクリプト。cron から 1 日 03:00 JST に呼ぶ想定。
//
// 使い方:
//   node scripts/monthly-report.mjs                  # 前月分を生成 + DELETE 実行
//   node scripts/monthly-report.mjs --month=2026-06  # 特定月を指定
//   node scripts/monthly-report.mjs --dry-run        # 生成・削除を試算のみ
//   node scripts/monthly-report.mjs --skip-scp       # ローカル保存のみ
//   node scripts/monthly-report.mjs --skip-delete    # レポートだけ更新

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function parseArgs(argv) {
  const opts = {
    month: null,
    dryRun: false,
    skipScp: false,
    skipDelete: false,
    skipNotify: false,
    forceCurrentMonth: false,
  };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--skip-scp") opts.skipScp = true;
    else if (a === "--skip-delete") opts.skipDelete = true;
    else if (a === "--skip-notify") opts.skipNotify = true;
    else if (a === "--force-current-month") opts.forceCurrentMonth = true;
    else if (a.startsWith("--month=")) opts.month = a.slice("--month=".length);
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/monthly-report.mjs [--month=YYYY-MM] [--dry-run] [--skip-scp] [--skip-delete] [--skip-notify] [--force-current-month]"
      );
      console.log(
        "  --force-current-month: 削除境界を JST 今月月初にする (= 前月分も削除、バッファ無視)"
      );
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

// JST 基準で「今日から見た前月」を返す
function previousMonthLabel(base = new Date()) {
  const jst = new Date(base.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth(); // 0..11、これが「今月」
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function validateMonth(label) {
  const m = label.match(/^(\d{4})-(\d{2})$/);
  if (!m) return false;
  const mon = Number(m[2]);
  return mon >= 1 && mon <= 12;
}

// JST 月初の UTC Date を返す
function jstMonthStart(year, month /* 1-12 */) {
  return new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS);
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[monthly-report ${ts}] ${msg}`);
}

async function fetchReport(monthLabel, opts) {
  const baseUrl =
    process.env.APP_BASE_URL ||
    "http://127.0.0.1:3011/claude-team-usage";
  const token = process.env.SYNC_TOKEN;
  if (!token) throw new Error("SYNC_TOKEN is not set");

  const url = `${baseUrl}/api/report/${monthLabel}`;
  log(`fetching ${url}`);
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `report fetch failed: ${res.status} ${res.statusText}\n${body.slice(0, 500)}`
    );
  }
  const html = await res.text();
  if (html.length < 500) {
    throw new Error(
      `report HTML too small (${html.length} bytes), suspecting broken output`
    );
  }
  return html;
}

async function saveLocal(monthLabel, html, opts) {
  const dir = path.join(PROJECT_ROOT, "tmp", "reports");
  await mkdir(dir, { recursive: true });
  const localPath = path.join(dir, `claude-team-usage-${monthLabel}.html`);
  await writeFile(localPath, html, "utf8");
  log(`saved locally: ${localPath} (${html.length} bytes)`);
  return localPath;
}

// dest が "host:/path" 形式なら scp モード、それ以外 (絶対/相対パス) なら
// ローカルコピーモード。サーバ内で cron 実行するときは絶対パスにする。
function parseDest(dest) {
  const m = dest.match(/^([^\s:@\/][^\s:]*):(.+)$/);
  if (m) return { mode: "scp", host: m[1], dir: m[2] };
  return { mode: "local", host: null, dir: dest };
}

async function scpToProduction(monthLabel, localPath, opts) {
  if (opts.skipScp) {
    log("skip scp (--skip-scp)");
    return null;
  }
  const destRaw =
    process.env.REPORT_HTML_DEST || "conoha-root:/var/www/app/html";
  const dest = parseDest(destRaw);
  const remoteName = `claude-team-usage-${monthLabel}.html`;
  const target =
    dest.mode === "scp"
      ? `${dest.host}:${dest.dir}/${remoteName}`
      : path.join(dest.dir, remoteName);
  const publicUrl =
    process.env.REPORT_PUBLIC_URL_BASE || "https://app.instyle.group/html";
  log(`${dest.mode === "scp" ? "scp" : "cp"} ${localPath} -> ${target}`);
  if (opts.dryRun) {
    log(`dry-run: skipping actual ${dest.mode === "scp" ? "scp" : "cp"}`);
    return `${publicUrl}/${remoteName}`;
  }
  if (dest.mode === "local") {
    const { copyFile, mkdir: mkdirFs } = await import("node:fs/promises");
    await mkdirFs(dest.dir, { recursive: true });
    await copyFile(localPath, target);
  } else {
    const { spawn } = await import("node:child_process");
    await new Promise((resolve, reject) => {
      const proc = spawn("scp", [localPath, target], { stdio: "inherit" });
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`scp exited with code ${code}`));
      });
      proc.on("error", reject);
    });
  }
  return `${publicUrl}/${remoteName}`;
}

async function runRemote(args, opts) {
  const { spawn } = await import("node:child_process");
  const [remote, ...rest] = args;
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ssh",
      [remote, ...rest],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (b) => (out += b.toString("utf8")));
    proc.stderr.on("data", (b) => (err += b.toString("utf8")));
    proc.on("exit", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`ssh exit ${code}: ${err.trim()}`));
    });
    proc.on("error", reject);
  });
}

// /var/www/app/html/claude-team-usage-YYYY-MM.html を列挙して
// 索引 HTML を組み立て、claude-team-usage-reports.html として書き込む。
// dest が local モードなら fs.readdir、scp モードなら ssh ls を使う。
async function rebuildIndex(opts) {
  if (opts.dryRun || opts.skipScp) {
    log(`skip index rebuild (dryRun=${opts.dryRun} skipScp=${opts.skipScp})`);
    return null;
  }
  const destRaw =
    process.env.REPORT_HTML_DEST || "conoha-root:/var/www/app/html";
  const dest = parseDest(destRaw);
  const publicUrl =
    process.env.REPORT_PUBLIC_URL_BASE || "https://app.instyle.group/html";

  let raw = "";
  if (dest.mode === "scp") {
    log(`listing ${dest.host}:${dest.dir}/claude-team-usage-*.html`);
    raw = await runRemote(
      [
        dest.host,
        `ls -1 ${dest.dir}/claude-team-usage-????-??.html 2>/dev/null || true`,
      ],
      opts
    );
  } else {
    log(`listing ${dest.dir}/claude-team-usage-*.html`);
    const { readdir } = await import("node:fs/promises");
    try {
      const names = await readdir(dest.dir);
      raw = names.join("\n");
    } catch (err) {
      log(`WARN: readdir failed: ${err.message}`);
      raw = "";
    }
  }
  const months = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/claude-team-usage-(\d{4})-(\d{2})\.html$/);
      return m ? `${m[1]}-${m[2]}` : null;
    })
    .filter(Boolean)
    .sort()
    .reverse();
  log(`found ${months.length} monthly snapshots`);

  const rows = months
    .map(
      (label) =>
        `<li><a href="${publicUrl}/claude-team-usage-${label}.html">${label}</a></li>`
    )
    .join("\n      ");

  const generatedAt = new Date().toISOString();
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>claude-team-usage 月次レポート索引</title>
  <link rel="icon" href="https://app.instyle.group/_shared/static/favicon.png">
  <style>
    body { font-family: system-ui, -apple-system, "Helvetica Neue", sans-serif; background: #ede9e0; color: #35362d; margin: 0; padding: 40px 5vw; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .muted { color: #82837a; font-size: 13px; }
    ul { list-style: none; padding: 0; margin: 24px 0; }
    li { padding: 12px 16px; background: rgba(255,255,255,0.6); border-radius: 12px; margin-bottom: 8px; }
    a { color: #d4772c; text-decoration: none; font-size: 15px; }
    a:hover { text-decoration: underline; }
    footer { margin-top: 40px; font-size: 12px; color: #82837a; }
  </style>
</head>
<body>
  <h1>claude-team-usage 月次レポート索引</h1>
  <p class="muted">生成日時 (UTC): ${generatedAt}<br>月ごとの利用状況スナップショット (${months.length} 件)</p>
  <ul>
      ${rows || "<li class=\"muted\">まだレポートがありません</li>"}
  </ul>
  <footer>
    最新の <a href="https://app.instyle.group/claude-team-usage/">claude-team-usage ダッシュボード</a> ／ INSTYLE GROUP
  </footer>
</body>
</html>`;

  const localDir = path.join(PROJECT_ROOT, "tmp", "reports");
  await mkdir(localDir, { recursive: true });
  const localPath = path.join(localDir, "claude-team-usage-reports.html");
  await writeFile(localPath, html, "utf8");
  log(`saved index locally: ${localPath}`);

  const indexName = "claude-team-usage-reports.html";
  if (dest.mode === "local") {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(localPath, path.join(dest.dir, indexName));
  } else {
    const { spawn } = await import("node:child_process");
    const target = `${dest.host}:${dest.dir}/${indexName}`;
    await new Promise((resolve, reject) => {
      const proc = spawn("scp", [localPath, target], { stdio: "inherit" });
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`scp index exited with code ${code}`));
      });
      proc.on("error", reject);
    });
  }
  const indexUrl = `${publicUrl}/${indexName}`;
  log(`index uploaded: ${indexUrl}`);
  return indexUrl;
}

async function verifyPublicUrl(url, opts) {
  if (!url) return null;
  if (opts.dryRun || opts.skipScp) return null;
  try {
    const res = await fetch(url, { method: "HEAD" });
    log(`HEAD ${url} -> ${res.status}`);
    if (!res.ok) {
      throw new Error(`public URL not 2xx: ${res.status}`);
    }
    return res.status;
  } catch (err) {
    log(`WARN: verification failed: ${err.message}`);
    throw err;
  }
}

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({
    connectionString: url,
    ssl:
      url.includes("sslmode=require") || url.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
    max: 1,
  });
}

async function runDelete(pool, opts) {
  // 通常: 境界 = JST 今月月初 - 1 ヶ月 (前月分は残す)。
  // --force-current-month: 境界 = JST 今月月初 (前月分も削除)。
  const now = new Date();
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1; // 今月 (1..12)
  const boundary = opts.forceCurrentMonth
    ? jstMonthStart(y, m) // 今月月初 JST の UTC
    : jstMonthStart(y, m - 1); // 前月月初 JST の UTC
  const boundaryIso = boundary.toISOString();
  const boundaryLabel = opts.forceCurrentMonth
    ? "JST 今月月初 (バッファ無視)"
    : "JST 前月月初";
  log(`delete boundary: occurred_at < ${boundaryIso} (${boundaryLabel})`);

  if (opts.skipDelete) {
    log("skip delete (--skip-delete): no DB queries executed");
    return { deleted: 0, targetCount: 0 };
  }

  // 事前カウント
  const { rows: countRows } = await pool.query(
    "SELECT count(*)::bigint AS n, min(occurred_at) AS min_ts, max(occurred_at) AS max_ts FROM cowork_events WHERE occurred_at < $1",
    [boundary]
  );
  const targetCount = Number(countRows[0]?.n ?? 0);
  log(
    `target rows: ${targetCount} (min=${countRows[0]?.min_ts ?? "-"}, max=${
      countRows[0]?.max_ts ?? "-"
    })`
  );

  if (opts.dryRun) {
    log("dry-run: skipping actual DELETE + VACUUM");
    return { deleted: 0, targetCount };
  }
  if (targetCount === 0) {
    log("no rows to delete, skipping VACUUM");
    return { deleted: 0, targetCount };
  }

  const t0 = Date.now();
  const { rowCount } = await pool.query(
    "DELETE FROM cowork_events WHERE occurred_at < $1",
    [boundary]
  );
  log(`deleted ${rowCount} rows in ${Date.now() - t0} ms`);

  // sync_log も 90 日以上前を掃除
  const { rowCount: syncDeleted } = await pool.query(
    "DELETE FROM sync_log WHERE ran_at < now() - interval '90 days'"
  );
  if (syncDeleted && syncDeleted > 0)
    log(`deleted ${syncDeleted} sync_log rows (>90d old)`);

  // VACUUM ANALYZE を別クライアントで実行（VACUUM は transaction 内で禁止）
  log("running VACUUM ANALYZE cowork_events");
  const client = await pool.connect();
  try {
    await client.query("VACUUM ANALYZE cowork_events");
  } finally {
    client.release();
  }
  log(`VACUUM ANALYZE done`);

  return { deleted: rowCount ?? 0, targetCount };
}

async function notify(text, opts) {
  if (opts.skipNotify) return;
  const url = process.env.TELEGRAM_NOTIFY_URL;
  if (!url) {
    log("no TELEGRAM_NOTIFY_URL, skipping notify");
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, source: "claude-team-usage/monthly-report" }),
    });
    log(`notify: ${res.status}`);
  } catch (err) {
    log(`notify failed: ${err.message}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const monthLabel = opts.month || previousMonthLabel();
  if (!validateMonth(monthLabel)) {
    throw new Error(`invalid month: ${monthLabel}`);
  }
  log(`month=${monthLabel} dryRun=${opts.dryRun}`);

  const html = await fetchReport(monthLabel, opts);
  const localPath = await saveLocal(monthLabel, html, opts);

  let publicUrl = null;
  try {
    publicUrl = await scpToProduction(monthLabel, localPath, opts);
    await verifyPublicUrl(publicUrl, opts);
  } catch (err) {
    log(`ERROR during scp/verify: ${err.message}`);
    log(
      "aborting DELETE because report snapshot could not be confirmed on production"
    );
    await notify(
      `⚠ claude-team-usage monthly-report ${monthLabel}: snapshot upload failed. DELETE skipped. ${err.message}`,
      opts
    );
    process.exit(2);
  }

  const pool = makePool();
  let deleteResult = { deleted: 0, targetCount: 0 };
  try {
    deleteResult = await runDelete(pool, opts);
  } finally {
    await pool.end();
  }

  let indexUrl = null;
  try {
    indexUrl = await rebuildIndex(opts);
  } catch (err) {
    log(`WARN: index rebuild failed: ${err.message}`);
  }

  const msg = [
    `✅ claude-team-usage monthly-report ${monthLabel}`,
    publicUrl ? `snapshot: ${publicUrl}` : "snapshot: (local only)",
    indexUrl ? `index: ${indexUrl}` : null,
    `delete target: ${deleteResult.targetCount} rows`,
    `deleted: ${deleteResult.deleted} rows`,
    opts.dryRun ? "(dry-run)" : null,
  ]
    .filter(Boolean)
    .join("\n");
  log(msg);
  await notify(msg, opts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
