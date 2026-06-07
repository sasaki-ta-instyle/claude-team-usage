import Link from "next/link";

import { combinedMemberSummary } from "@/lib/cowork-queries";
import { recommendSeat, SEAT_RECO_META } from "@/lib/seat-recommendation";
import { formatCost, formatTokens, isoDateMinusDays } from "@/lib/format";

export const dynamic = "force-dynamic";

const PRESETS = [
  { label: "過去 7 日", days: 7 },
  { label: "過去 30 日", days: 30 },
  { label: "過去 90 日", days: 90 },
];

export default async function MembersPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await props.searchParams;
  const range = Math.max(1, Math.min(180, Number(days) || 30));
  const fromDate = isoDateMinusDays(range);
  const toDate = isoDateMinusDays(0);
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date();
  const members = await combinedMemberSummary({ from, to });

  return (
    <>
      <h1 className="page-title">メンバー</h1>
      <p className="page-subtitle">
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。
        Cowork + Code（OTel push）の利用者を統合表示。推奨 seat は
        <strong>Code 利用 = Premium 必須</strong> / <strong>Cowork ≥ $100 = Premium 推奨</strong> /
        <strong>月 &lt; $10 = API 直渡し候補</strong> / それ以外 = Standard 維持 の 4 分類。
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
                  <th className="num">Cowork プロンプト</th>
                  <th className="num">Code プロンプト</th>
                  <th className="num">Cowork コスト</th>
                  <th className="num">Code コスト</th>
                  <th className="num">合計コスト</th>
                  <th className="num">合計トークン</th>
                  <th>推奨 seat</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const reco = recommendSeat(m);
                  const meta = SEAT_RECO_META[reco];
                  const isApiDirect = reco === "api_direct_candidate";
                  return (
                    <tr key={m.email} className={isApiDirect ? "row-warn" : undefined}>
                      <td>
                        <Link href={`/members/${encodeURIComponent(m.email)}`}>
                          {m.email}
                        </Link>
                      </td>
                      <td className="num">{m.coworkPrompts.toLocaleString()}</td>
                      <td className="num">{m.codePrompts.toLocaleString()}</td>
                      <td className="num">{formatCost(m.coworkCostCents)}</td>
                      <td className="num">{formatCost(m.codeCostCents)}</td>
                      <td className="num">
                        <strong>{formatCost(m.totalCostCents)}</strong>
                      </td>
                      <td className="num">{formatTokens(m.totalTokens)}</td>
                      <td>
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        {meta.helper ? (
                          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                            {meta.helper}
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
