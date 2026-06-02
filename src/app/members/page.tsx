import Link from "next/link";

import { memberSummary, PREMIUM_COST_CENTS_DEFAULT } from "@/lib/queries";
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
  const members = await memberSummary({ fromDate, toDate });

  return (
    <>
      <h1 className="page-title">メンバー</h1>
      <p className="page-subtitle">
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。Claude Code 日次合計。
      </p>

      <div className="flex-row" style={{ marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <Link
            key={p.days}
            className={`btn${p.days === range ? " btn--primary" : ""}`}
            href={`/members?days=${p.days}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="glass-panel">
        {members.length === 0 ? (
          <p className="muted">
            データがありません。<code>/api/sync</code> を実行してください。
          </p>
        ) : (
          <table className="usage-table">
            <thead>
              <tr>
                <th>メンバー</th>
                <th>seat</th>
                <th className="num">トークン</th>
                <th className="num">推定コスト</th>
                <th className="num">セッション</th>
                <th className="num">commits</th>
                <th>推奨</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const recommend =
                  m.costCents >= PREMIUM_COST_CENTS_DEFAULT
                    ? "premium"
                    : "standard";
                return (
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
                      <span
                        className={`seat-badge seat-badge--${m.seatType ?? "null"}`}
                      >
                        {m.seatType ?? "未設定"}
                      </span>
                    </td>
                    <td className="num">{formatTokens(m.tokens)}</td>
                    <td className="num">{formatCost(m.costCents)}</td>
                    <td className="num">{m.sessions.toLocaleString()}</td>
                    <td className="num">{m.commits.toLocaleString()}</td>
                    <td>
                      <span className={`seat-badge seat-badge--${recommend}`}>
                        {recommend}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
