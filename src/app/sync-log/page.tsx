import { syncLogRows } from "@/lib/queries";

export const dynamic = "force-dynamic";

function fmtMs(ms: number | null) {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function SyncLogPage() {
  const rows = await syncLogRows(50);

  return (
    <>
      <h1 className="page-title">取り込み履歴</h1>
      <p className="page-subtitle">
        直近の <code>/api/sync</code> 実行結果。cron 6 時間ごと + 必要時に手動 curl。
      </p>

      <div className="glass-panel">
        {rows.length === 0 ? (
          <p className="muted">まだ取り込み履歴がありません。</p>
        ) : (
          <table className="usage-table">
            <thead>
              <tr>
                <th>実行時刻</th>
                <th>source</th>
                <th>期間</th>
                <th className="num">行数</th>
                <th>状態</th>
                <th className="num">所要</th>
                <th>エラー</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.ranAt).toLocaleString("ja-JP")}</td>
                  <td>{r.source}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {r.fromDate ? `${r.fromDate} → ${r.toDate}` : "—"}
                  </td>
                  <td className="num">{r.rowsUpserted}</td>
                  <td>
                    <span
                      className={`seat-badge ${
                        r.status === "ok"
                          ? "seat-badge--premium"
                          : "seat-badge--null"
                      }`}
                      style={
                        r.status === "error"
                          ? {
                              background: "rgba(198,41,44,0.12)",
                              borderColor: "rgba(198,41,44,0.4)",
                              color: "var(--color-error)",
                            }
                          : undefined
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="num">{fmtMs(r.durationMs)}</td>
                  <td
                    className="muted"
                    style={{
                      fontSize: 11,
                      maxWidth: 360,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.errorText ?? undefined}
                  >
                    {r.errorText ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
