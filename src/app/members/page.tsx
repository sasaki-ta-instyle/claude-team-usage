import Link from "next/link";

import {
  combinedMemberSummary,
  getSeatAssignments,
  memberActivitySignals,
} from "@/lib/cowork-queries";
import { recommendSeat, SEAT_RECO_META } from "@/lib/seat-recommendation";
import { formatCost, formatTokens, isoDateMinusDays } from "@/lib/format";

export const dynamic = "force-dynamic";

const PRESETS = [
  { label: "過去 7 日", days: 7 },
  { label: "過去 30 日", days: 30 },
  { label: "過去 90 日", days: 90 },
];

const HIGH_ACTIVITY_DAYS = 15;

export default async function MembersPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await props.searchParams;
  const range = Math.max(1, Math.min(180, Number(days) || 30));
  const fromDate = isoDateMinusDays(range);
  const toDate = isoDateMinusDays(0);
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date();
  const [members, signals, seats] = await Promise.all([
    combinedMemberSummary({ from, to }),
    memberActivitySignals({ from, to }),
    getSeatAssignments(),
  ]);

  return (
    <>
      <h1 className="page-title">メンバー</h1>
      <p className="page-subtitle">
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。
        Cowork + Code（OTel push）の合算コストで判定。
        <strong>月 ≥ $100 = Premium 推奨</strong> / <strong>$10 – $100 = Standard 維持</strong> /
        <strong>月 &lt; $10 = API 従量候補</strong> / プロンプト 0 = 未使用。
        <strong>制限到達回数</strong>列（api_error 観測数）で rate limit cap への当たり方を判断、
        副バッジで <strong>高稼働</strong>（≥ {HIGH_ACTIVITY_DAYS} 日アクティブ）を表示。
        <strong>現状 tier</strong> と推奨がズレている場合は「⬇ 過剰投資」（Premium 割当だが推奨は下位）／
        「⬆ 過小投資」（Standard 割当だが推奨 Premium）バッジで警告する。
      </p>

      <div className="flex-row" style={{ marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <Link
            key={p.days}
            className={`btn${p.days === range ? " btn--quiet-active" : ""}`}
            href={`/members?days=${p.days}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="glass-panel">
        {members.length === 0 ? (
          <p className="muted">
            データがありません。Cowork admin の Monitoring か、メンバーの
            Claude Code OTel 設定（<code>scripts/install-claude-code-otel.sh</code>）が必要です。
          </p>
        ) : (
          <div className="table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th className="num num--narrow">Cowork プロンプト</th>
                  <th className="num num--narrow">Code プロンプト</th>
                  <th className="num">Cowork コスト</th>
                  <th className="num">Code コスト</th>
                  <th className="num">合計コスト</th>
                  <th className="num">稼働日</th>
                  <th className="num">最大日コスト</th>
                  <th className="num num--narrow">制限到達回数</th>
                  <th>現状 tier</th>
                  <th>推奨 seat</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const reco = recommendSeat(m);
                  const meta = SEAT_RECO_META[reco];
                  const isApiDirect = reco === "api_direct_candidate";
                  const sig = signals.get(m.email.toLowerCase());
                  const activeDays = sig?.activeDays ?? 0;
                  const maxDayCostCents = sig?.maxDayCostCents ?? 0;
                  const apiErrorCount = sig?.apiErrorCount ?? 0;
                  const isCapped = apiErrorCount > 0;
                  const isHighActivity = activeDays >= HIGH_ACTIVITY_DAYS;
                  const currentSeat = seats.get(m.email.toLowerCase()) ?? null;
                  const overInvest =
                    currentSeat === "premium" && reco !== "premium";
                  const underInvest =
                    currentSeat === "standard" && reco === "premium";
                  return (
                    <tr key={m.email} className={isApiDirect ? "row-warn" : undefined}>
                      <td>
                        <Link href={`/members/${encodeURIComponent(m.email)}`}>
                          {m.email}
                        </Link>
                      </td>
                      <td className="num num--narrow">{m.coworkPrompts.toLocaleString()}</td>
                      <td className="num num--narrow">{m.codePrompts.toLocaleString()}</td>
                      <td className="num">{formatCost(m.coworkCostCents)}</td>
                      <td className="num">{formatCost(m.codeCostCents)}</td>
                      <td className="num">
                        <strong>{formatCost(m.totalCostCents)}</strong>
                      </td>
                      <td className="num">{activeDays}</td>
                      <td className="num">{formatCost(maxDayCostCents)}</td>
                      <td
                        className="num num--narrow"
                        style={isCapped ? { color: "var(--color-warning)", fontWeight: 600 } : undefined}
                      >
                        {apiErrorCount}
                      </td>
                      <td>
                        {currentSeat === "premium" ? (
                          <span className="badge badge-success">Premium</span>
                        ) : currentSeat === "standard" ? (
                          <span className="badge badge-info">Standard</span>
                        ) : (
                          <span className="badge badge-default">未割り当て</span>
                        )}
                        {overInvest ? (
                          <div style={{ marginTop: 4 }}>
                            <span className="badge badge-warning" title="Premium 割当だが推奨は下位。Standard / API 従量への切り替え検討">
                              ⬇ 過剰投資
                            </span>
                          </div>
                        ) : null}
                        {underInvest ? (
                          <div style={{ marginTop: 4 }}>
                            <span className="badge badge-accent" title="Standard 割当だが推奨は Premium。昇格検討">
                              ⬆ 過小投資
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        {meta.helper ? (
                          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                            {meta.helper}
                          </div>
                        ) : null}
                        {isHighActivity ? (
                          <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                            <span className="badge badge-accent" title={`過去 ${range} 日のうち ${activeDays} 日アクティブ`}>
                              高稼働
                            </span>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
