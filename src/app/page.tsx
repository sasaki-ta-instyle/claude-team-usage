import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { PREVIEW } from "@/lib/preview";
import {
  combinedMemberSummary,
  combinedOverall,
} from "@/lib/cowork-queries";
import { usersRoster } from "@/lib/queries";
import { recommendSeat } from "@/lib/seat-recommendation";
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

  const [overall, members, roster] = await Promise.all([
    combinedOverall({ from, to }),
    combinedMemberSummary({ from, to }),
    usersRoster(),
  ]);

  const recoCounts = {
    premium: 0,
    standard: 0,
    api_direct_candidate: 0,
    unused: 0,
  };
  const memberByEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  for (const m of members) recoCounts[recommendSeat(m)]++;
  // シート保有者で当月イベント 0 の人は events 集計に出てこないので、
  // roster と突き合わせて未使用にカウントする。
  for (const u of roster) {
    if (!memberByEmail.has(u.email)) recoCounts.unused++;
  }

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
          <p className="kpi-label">Premium 推奨</p>
          <p className="kpi-value">{recoCounts.premium}</p>
          <p className="kpi-sub">月 ≥ $100</p>
        </div>
      </section>

      <section className="kpi-hero-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <p className="kpi-label">Standard 維持</p>
          <p className="kpi-value">{recoCounts.standard}</p>
          <p className="kpi-sub">$10 – $100</p>
        </div>
        <div className="card">
          <p className="kpi-label">API 従量候補</p>
          <p className="kpi-value">{recoCounts.api_direct_candidate}</p>
          <p className="kpi-sub">月 &lt; $10（pay-as-you-go の方が安い）</p>
        </div>
        <div className="card">
          <p className="kpi-label">未使用</p>
          <p className="kpi-value">{recoCounts.unused}</p>
          <p className="kpi-sub">プロンプト 0（シート停止検討）</p>
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
