import Link from "next/link";

import { centsToUsd, formatCost, formatTokens, isoDateMinusDays } from "@/lib/format";
import { getUserByEmail, memberDailyTrend } from "@/lib/queries";
import { SeatForm } from "./seat-form";
import { TrendChart, type TrendPoint } from "./trend-chart";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage(props: {
  params: Promise<{ email: string }>;
}) {
  const { email: encoded } = await props.params;
  const email = decodeURIComponent(encoded).toLowerCase();

  const user = await getUserByEmail(email);
  const rows = await memberDailyTrend(email, 30);

  const fromDate = isoDateMinusDays(30);
  const toDate = isoDateMinusDays(0);

  const trend: TrendPoint[] = rows.map((r) => {
    const tokens =
      (r.tokensInput ?? 0) +
      (r.tokensOutput ?? 0) +
      (r.tokensCacheRead ?? 0) +
      (r.tokensCacheCreation ?? 0);
    return {
      date: r.date as unknown as string,
      tokens,
      costUsd: centsToUsd(r.estimatedCostCents ?? 0),
    };
  });

  const totalTokens = trend.reduce((a, t) => a + t.tokens, 0);
  const totalCostCents = rows.reduce((a, r) => a + (r.estimatedCostCents ?? 0), 0);
  const totalSessions = rows.reduce((a, r) => a + (r.sessions ?? 0), 0);
  const totalCommits = rows.reduce((a, r) => a + (r.commits ?? 0), 0);

  return (
    <>
      <Link href="/members" className="muted" style={{ fontSize: 12 }}>
        ← メンバー一覧
      </Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>
        {user?.displayName ?? user?.name ?? email}
      </h1>
      <p className="page-subtitle">
        {email} ・ 期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>
      </p>

      <section className="kpi-grid">
        <div className="card">
          <p className="kpi-label">合計トークン</p>
          <p className="kpi-value">{formatTokens(totalTokens)}</p>
        </div>
        <div className="card">
          <p className="kpi-label">推定コスト</p>
          <p className="kpi-value">{formatCost(totalCostCents).split(" / ")[0]}</p>
          <p className="kpi-sub">{formatCost(totalCostCents).split(" / ")[1]}</p>
        </div>
        <div className="card">
          <p className="kpi-label">セッション</p>
          <p className="kpi-value">{totalSessions.toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="kpi-label">コミット</p>
          <p className="kpi-value">{totalCommits.toLocaleString()}</p>
        </div>
      </section>

      <section className="glass-panel">
        <h2 style={{ marginTop: 0 }}>日次推移（過去 30 日）</h2>
        {trend.length === 0 ? (
          <p className="muted">この期間のデータがありません。</p>
        ) : (
          <TrendChart data={trend} />
        )}
      </section>

      <section className="glass-panel" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Seat タグ</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          現在: <strong>{user?.seatType ?? "未設定"}</strong>。Admin API が seat 種別を
          返した場合、次回 sync で自動上書きされます（手動値は API が未返却の時のみ尊重）。
        </p>
        <SeatForm email={email} current={user?.seatType ?? null} />
      </section>
    </>
  );
}
