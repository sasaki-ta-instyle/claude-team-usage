import { messagesUsageSummary } from "@/lib/queries";
import { formatTokens, isoDateMinusDays } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ApiMessagesPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await props.searchParams;
  const range = Math.max(1, Math.min(180, Number(days) || 30));
  const fromDate = isoDateMinusDays(range);
  const toDate = isoDateMinusDays(0);
  const rows = await messagesUsageSummary({ fromDate, toDate });

  // Aggregate by account_id for the summary card.
  const byAccount = new Map<
    string,
    { tokens: number; entries: typeof rows }
  >();
  for (const r of rows) {
    const cur = byAccount.get(r.accountId) ?? {
      tokens: 0,
      entries: [] as typeof rows,
    };
    cur.tokens +=
      r.tokensInput + r.tokensOutput + r.tokensCacheRead + r.tokensCacheCreation;
    cur.entries.push(r);
    byAccount.set(r.accountId, cur);
  }

  return (
    <>
      <h1 className="page-title">API Messages</h1>
      <p className="page-subtitle">
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。account ×
        workspace × api_key × model 単位の集計（per-user 紐付けは初版未対応）。
      </p>

      {rows.length === 0 ? (
        <div className="glass-panel">
          <p className="muted">
            データがありません。<code>/api/sync?source=messages</code> を実行してください。
          </p>
        </div>
      ) : (
        <div className="glass-panel">
          <table className="usage-table">
            <thead>
              <tr>
                <th>account / workspace</th>
                <th>api_key</th>
                <th>model</th>
                <th className="num">input</th>
                <th className="num">output</th>
                <th className="num">cache read</th>
                <th className="num">cache write</th>
                <th className="num">合計</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .sort(
                  (a, b) =>
                    b.tokensInput +
                    b.tokensOutput +
                    b.tokensCacheRead +
                    b.tokensCacheCreation -
                    (a.tokensInput +
                      a.tokensOutput +
                      a.tokensCacheRead +
                      a.tokensCacheCreation)
                )
                .map((r) => {
                  const total =
                    r.tokensInput +
                    r.tokensOutput +
                    r.tokensCacheRead +
                    r.tokensCacheCreation;
                  return (
                    <tr key={`${r.accountId}|${r.workspaceId}|${r.apiKeyId}|${r.model}`}>
                      <td>
                        <div>{r.accountId || "—"}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {r.workspaceId || "default workspace"}
                        </div>
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {r.apiKeyId || "—"}
                      </td>
                      <td>{r.model || "—"}</td>
                      <td className="num">{formatTokens(r.tokensInput)}</td>
                      <td className="num">{formatTokens(r.tokensOutput)}</td>
                      <td className="num">{formatTokens(r.tokensCacheRead)}</td>
                      <td className="num">
                        {formatTokens(r.tokensCacheCreation)}
                      </td>
                      <td className="num">
                        <strong>{formatTokens(total)}</strong>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
