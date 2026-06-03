import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { PREVIEW } from "@/lib/preview";
import {
  combinedMemberSummary,
  combinedOverall,
} from "@/lib/cowork-queries";
import { PREMIUM_COST_CENTS_DEFAULT } from "@/lib/queries";
import {
  formatCost,
  formatTokens,
  isoDateMinusDays,
  monthStartIso,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!PREVIEW) {
    const session = await auth().catch(() => null);
    if (!session?.user) redirect("/login");
  }

  const fromDate = monthStartIso();
  const toDate = isoDateMinusDays(0);
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date();

  const [overall, members] = await Promise.all([
    combinedOverall({ from, to }),
    combinedMemberSummary({ from, to }),
  ]);

  const premiumCandidates = members.filter(
    (m) => m.totalCostCents >= PREMIUM_COST_CENTS_DEFAULT
  ).length;

  const [costUsd, costJpy] = formatCost(overall.totalCostCents).split(" / ");

  return (
    <>
      <h1 className="page-title">概要</h1>
      <p className="page-subtitle">
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>（当月）。
        Cowork + Claude Code（OTel push）の合算。
      </p>

      <section className="kpi-hero-grid">
        <div className="kpi-hero">
          <p className="kpi-label">当月の推定コスト</p>
          <p className="kpi-value">{costUsd}</p>
          <p className="kpi-sub">
            {costJpy} ・ Cowork {formatCost(overall.coworkCostCents).split(" / ")[0]} ／ Code {formatCost(overall.codeCostCents).split(" / ")[0]}
          </p>
        </div>
        <div className="card">
          <p className="kpi-label">アクティブメンバー</p>
          <p className="kpi-value">{overall.uniqueUsers}</p>
          <p className="kpi-sub">Cowork または Code を使用</p>
        </div>
        <div className="card">
          <p className="kpi-label">合計トークン</p>
          <p className="kpi-value">{formatTokens(overall.totalTokens)}</p>
          <p className="kpi-sub">input + output</p>
        </div>
        <div className="card">
          <p className="kpi-label">Premium 候補</p>
          <p className="kpi-value">{premiumCandidates}</p>
          <p className="kpi-sub">月コスト $50 以上のメンバー数</p>
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
            まだ取り込みデータがありません。Cowork admin の Monitoring か、
            メンバーの Claude Code への OTel 設定が必要です。
          </p>
        ) : (
          <div className="table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th className="num">Cowork コスト</th>
                  <th className="num">Code コスト</th>
                  <th className="num">合計コスト</th>
                  <th className="num">トークン</th>
                </tr>
              </thead>
              <tbody>
                {members.slice(0, 8).map((m) => (
                  <tr key={m.email}>
                    <td>
                      <Link href={`/members/${encodeURIComponent(m.email)}`}>
                        {m.email}
                      </Link>
                    </td>
                    <td className="num">{formatCost(m.coworkCostCents)}</td>
                    <td className="num">{formatCost(m.codeCostCents)}</td>
                    <td className="num"><strong>{formatCost(m.totalCostCents)}</strong></td>
                    <td className="num">{formatTokens(m.totalTokens)}</td>
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
