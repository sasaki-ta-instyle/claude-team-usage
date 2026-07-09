import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  combinedMemberSummary,
  combinedOverall,
} from "@/lib/cowork-queries";
import { formatCost, formatTokens } from "@/lib/format";
import { usersRoster } from "@/lib/queries";
import { recommendSeat } from "@/lib/seat-recommendation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function checkAuth(req: Request): boolean {
  const token = process.env.SYNC_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function parseMonth(
  month: string
): { from: Date; to: Date; label: string } | null {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) return null;
  if (mon < 1 || mon > 12) return null;
  // JST の月初 → UTC。JST 2026-06-01 00:00 = UTC 2026-05-31 15:00。
  const from = new Date(Date.UTC(year, mon - 1, 1) - JST_OFFSET_MS);
  const to = new Date(Date.UTC(year, mon, 1) - JST_OFFSET_MS);
  return { from, to, label: `${year}-${String(mon).padStart(2, "0")}` };
}

function escape(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c]!)
  );
}

function loadCss(): string {
  try {
    return fs.readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8"
    );
  } catch {
    return "";
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ month: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { month } = await ctx.params;
  const range = parseMonth(month);
  if (!range) {
    return NextResponse.json(
      { error: "invalid month (expected YYYY-MM)" },
      { status: 400 }
    );
  }

  const [overall, members, roster] = await Promise.all([
    combinedOverall({ from: range.from, to: range.to }),
    combinedMemberSummary({ from: range.from, to: range.to }),
    usersRoster(),
  ]);

  const recoCounts = {
    premium: 0,
    standard: 0,
    api_direct_candidate: 0,
    unused: 0,
  };
  const memberByEmail = new Map(
    members.map((m) => [m.email.toLowerCase(), m])
  );
  for (const m of members) recoCounts[recommendSeat(m)]++;
  for (const u of roster) {
    if (!memberByEmail.has(u.email.toLowerCase())) recoCounts.unused++;
  }

  const totalCost = formatCost(overall.totalCostCents).split(" / ");
  const [costUsd, costJpy] = [totalCost[0] ?? "$0.00", totalCost[1] ?? "¥0"];
  const coworkOnly = formatCost(overall.coworkCostCents).split(" / ")[0] ?? "$0";
  const codeOnly = formatCost(overall.codeCostCents).split(" / ")[0] ?? "$0";

  const css = loadCss();
  const generatedAt = new Date().toISOString();

  const rowsHtml = members
    .map(
      (m) => `
      <tr>
        <td>${escape(m.email)}</td>
        <td class="num">${escape(formatCost(m.coworkCostCents))}</td>
        <td class="num">${escape(formatCost(m.codeCostCents))}</td>
        <td class="num"><strong>${escape(
          formatCost(m.totalCostCents)
        )}</strong></td>
        <td class="num">${escape(formatTokens(m.totalTokens))}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>claude-team-usage 月次レポート ${range.label}</title>
  <link rel="icon" href="https://app.instyle.group/_shared/static/favicon.png">
  <style>${css}</style>
  <style>
    body { padding: 40px 5vw; min-height: 100vh; }
    .report-header { margin-bottom: 32px; }
    .report-meta { margin-top: 4px; font-size: 12px; }
    .table-full { width: 100%; }
    .footer { margin-top: 40px; font-size: 12px; opacity: 0.7; }
  </style>
</head>
<body>
  <div class="scene-bg" aria-hidden="true"></div>
  <main>
    <header class="report-header">
      <h1 class="page-title">claude-team-usage 月次レポート</h1>
      <p class="page-subtitle">対象月: <strong>${range.label}</strong>（JST 月初〜翌月初）</p>
      <p class="report-meta muted">
        生成日時 (UTC): ${generatedAt}<br>
        Cowork + Claude Code (OTel push) の合算。この HTML は月初 cron で書き出された固定スナップショットで、原データ (<code>cowork_events</code>) は削除後も本レポートで参照できます。
      </p>
    </header>

    <section class="kpi-hero-grid">
      <div class="kpi-hero">
        <p class="kpi-label">${range.label} の推定コスト</p>
        <p class="kpi-value">${escape(costUsd)}</p>
        <p class="kpi-sub">${escape(costJpy)} ・ Cowork ${escape(coworkOnly)} ／ Code ${escape(codeOnly)}</p>
      </div>
      <div class="card">
        <p class="kpi-label">アクティブメンバー</p>
        <p class="kpi-value">${overall.uniqueUsers}</p>
        <p class="kpi-sub">Cowork または Code を使用</p>
      </div>
      <div class="card">
        <p class="kpi-label">合計トークン</p>
        <p class="kpi-value">${escape(formatTokens(overall.totalTokens))}</p>
        <p class="kpi-sub">input + output</p>
      </div>
      <div class="card">
        <p class="kpi-label">Premium 推奨</p>
        <p class="kpi-value">${recoCounts.premium}</p>
        <p class="kpi-sub">月 ≥ $100</p>
      </div>
    </section>

    <section class="kpi-hero-grid" style="margin-top:16px">
      <div class="card">
        <p class="kpi-label">Standard 維持</p>
        <p class="kpi-value">${recoCounts.standard}</p>
        <p class="kpi-sub">$10 – $100</p>
      </div>
      <div class="card">
        <p class="kpi-label">API 従量候補</p>
        <p class="kpi-value">${recoCounts.api_direct_candidate}</p>
        <p class="kpi-sub">月 &lt; $10</p>
      </div>
      <div class="card">
        <p class="kpi-label">未使用</p>
        <p class="kpi-value">${recoCounts.unused}</p>
        <p class="kpi-sub">プロンプト 0（レポート生成時点の roster と突合）</p>
      </div>
    </section>

    <section class="glass-panel" style="margin-top:24px">
      <h2 style="margin-top:0">メンバー別利用（全 ${members.length} 名）</h2>
      ${
        members.length === 0
          ? '<p class="muted">この月にはイベントが記録されていません。</p>'
          : `<div class="table-scroll"><table class="usage-table table-full">
               <thead><tr><th>メンバー</th><th class="num">Cowork コスト</th><th class="num">Code コスト</th><th class="num">合計コスト</th><th class="num">トークン</th></tr></thead>
               <tbody>${rowsHtml}</tbody>
             </table></div>`
      }
    </section>

    <p class="footer muted">
      claude-team-usage / INSTYLE GROUP ／
      <a href="https://app.instyle.group/claude-team-usage/">最新のダッシュボードへ</a>
    </p>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
