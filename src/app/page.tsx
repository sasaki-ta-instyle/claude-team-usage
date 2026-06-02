import Link from "next/link";

import {
  memberSummary,
  PREMIUM_COST_CENTS_DEFAULT,
} from "@/lib/queries";
import {
  formatCost,
  formatTokens,
  isoDateMinusDays,
  monthStartIso,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const fromDate = monthStartIso();
  const toDate = isoDateMinusDays(0);
  const members = await memberSummary({ fromDate, toDate });

  const totalMembers = members.length;
  const totalTokens = members.reduce((a, m) => a + m.tokens, 0);
  const totalCostCents = members.reduce((a, m) => a + m.costCents, 0);
  const premiumCandidates = members.filter(
    (m) => m.costCents >= PREMIUM_COST_CENTS_DEFAULT
  ).length;

  const [costUsd, costJpy] = formatCost(totalCostCents).split(" / ");

  return (
    <>
      <h1 className="page-title">概要</h1>
      <p className="page-subtitle">
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>（当月）。
        Claude Code をユーザー別 / 日次で集計。
      </p>

      <section className="kpi-hero-grid">
        <div className="kpi-hero">
          <p className="kpi-label">当月の推定コスト</p>
          <p className="kpi-value">{costUsd}</p>
          <p className="kpi-sub">
            {costJpy} ・ Anthropic Admin API の rolling 値
          </p>
        </div>
        <div className="card">
          <p className="kpi-label">アクティブメンバー</p>
          <p className="kpi-value">{totalMembers}</p>
          <p className="kpi-sub">Claude Code を使用</p>
        </div>
        <div className="card">
          <p className="kpi-label">合計トークン</p>
          <p className="kpi-value">{formatTokens(totalTokens)}</p>
          <p className="kpi-sub">input + output + cache</p>
        </div>
        <div className="card">
          <p className="kpi-label">Premium 候補</p>
          <p className="kpi-value">{premiumCandidates}</p>
          <p className="kpi-sub">閾値 $50 を超えたメンバー数</p>
        </div>
      </section>

      <section className="glass-panel">
        <div className="flex-row" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>当月の利用メンバー上位</h2>
          <span className="spacer" />
          <Link className="btn" href="/members">
            すべて見る
          </Link>
        </div>
        {members.length === 0 ? (
          <p className="muted">
            まだ取り込みデータがありません。<code>/api/sync?source=all</code> を一度実行して初期化してください。
          </p>
        ) : (
          <div className="table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th>seat 種別</th>
                  <th className="num">トークン</th>
                  <th className="num">推定コスト</th>
                  <th className="num">セッション</th>
                </tr>
              </thead>
              <tbody>
                {members.slice(0, 8).map((m) => (
                  <tr key={m.email}>
                    <td>
                      <Link href={`/members/${encodeURIComponent(m.email)}`}>
                        {m.displayName ?? m.email}
                      </Link>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {m.email}
                      </div>
                    </td>
                    <td>
                      <span className={`seat-badge seat-badge--${m.seatType ?? "null"}`}>
                        {m.seatType ?? "未設定"}
                      </span>
                    </td>
                    <td className="num">{formatTokens(m.tokens)}</td>
                    <td className="num">{formatCost(m.costCents)}</td>
                    <td className="num">{m.sessions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
