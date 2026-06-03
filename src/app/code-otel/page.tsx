import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

import {
  coworkMemberSummary,
  coworkOverall,
  coworkRecentEvents,
} from "@/lib/cowork-queries";
import { formatCost, formatTokens } from "@/lib/format";
import { PREVIEW } from "@/lib/preview";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  user_prompt: "プロンプト",
  api_request: "API リクエスト",
  api_error: "API エラー",
  tool_result: "ツール実行",
  tool_decision: "ツール判定",
  hook_execution_start: "フック開始",
  hook_execution_complete: "フック完了",
  plugin_loaded: "プラグイン読込",
};

export default async function CodeOtelPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!PREVIEW) {
    const session = await auth().catch(() => null);
    if (!session?.user) redirect("/login");
  }
  const { days } = await props.searchParams;
  const range = Math.max(1, Math.min(180, Number(days) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - range * 24 * 60 * 60 * 1000);

  const [overall, members, recent] = await Promise.all([
    coworkOverall({ from, to, service: "claude-code" }),
    coworkMemberSummary({ from, to, service: "claude-code" }),
    coworkRecentEvents({ limit: 20, service: "claude-code" }),
  ]);

  const [costUsd, costJpy] = formatCost(overall.totalCostCents).split(" / ");

  return (
    <>
      <h1 className="page-title">Code（OTel push）</h1>
      <p className="page-subtitle">
        過去 <strong>{range}</strong> 日。各メンバーの Claude Code CLI から
        OTel push で受信したイベントを集計（Anthropic Admin API 由来の
        /members とは別経路）。
      </p>

      {overall.uniqueUsers === 0 ? (
        <div className="callout">
          <strong>未受信</strong>
          <span>
            まだ Claude Code からのテレメトリが届いていません。claude.ai 組織
            設定 → Claude Code → 管理設定（settings.json）に
            <code>env.CLAUDE_CODE_ENABLE_TELEMETRY</code> や
            <code>env.OTEL_EXPORTER_OTLP_ENDPOINT</code> 等を設定すると、
            組織内の全 CLI / IDE / Desktop に自動配信されます。詳細は本リポジトリ
            の <code>CLAUDE.md</code>「組織配信」節を参照。
          </span>
        </div>
      ) : null}

      <section className="kpi-hero-grid">
        <div className="kpi-hero">
          <p className="kpi-label">期間の合計コスト</p>
          <p className="kpi-value">{costUsd}</p>
          <p className="kpi-sub">{costJpy} ・ Claude Code OTel cost_usd 合計</p>
        </div>
        <div className="card">
          <p className="kpi-label">利用ユーザー</p>
          <p className="kpi-value">{overall.uniqueUsers}</p>
          <p className="kpi-sub">期間内に Code を使った人数</p>
        </div>
        <div className="card">
          <p className="kpi-label">プロンプト数</p>
          <p className="kpi-value">{overall.promptCount.toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="kpi-label">合計トークン</p>
          <p className="kpi-value">{formatTokens(overall.totalTokens)}</p>
          <p className="kpi-sub">input + output</p>
        </div>
      </section>

      <section className="glass-panel">
        <h2 style={{ marginTop: 0 }}>ユーザー別の利用</h2>
        {members.length === 0 ? (
          <p className="muted">期間内に Code を使ったメンバーはいません。</p>
        ) : (
          <div className="table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>ユーザー</th>
                  <th className="num">プロンプト</th>
                  <th className="num">API リクエスト</th>
                  <th className="num">エラー</th>
                  <th className="num">ツール使用</th>
                  <th className="num">トークン</th>
                  <th className="num">推定コスト</th>
                  <th>直近</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.email}>
                    <td>{m.email}</td>
                    <td className="num">{m.promptCount.toLocaleString()}</td>
                    <td className="num">{m.apiRequestCount.toLocaleString()}</td>
                    <td className="num">{m.apiErrorCount.toLocaleString()}</td>
                    <td className="num">{m.toolUseCount.toLocaleString()}</td>
                    <td className="num">{formatTokens(m.inputTokens + m.outputTokens)}</td>
                    <td className="num">{formatCost(m.totalCostCents)}</td>
                    <td className="muted" style={{ fontSize: 11 }}>
                      {m.lastSeen
                        ? new Date(m.lastSeen).toLocaleString("ja-JP")
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-panel" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>直近 20 イベント</h2>
        {recent.length === 0 ? (
          <p className="muted">イベントがありません。</p>
        ) : (
          <div className="table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>時刻</th>
                  <th>種類</th>
                  <th>ユーザー</th>
                  <th>モデル / ツール</th>
                  <th className="num">推定コスト</th>
                  <th>備考</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {new Date(e.occurredAt).toLocaleString("ja-JP")}
                    </td>
                    <td>{EVENT_LABEL[e.eventName] ?? e.eventName}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {e.userEmail ?? "—"}
                    </td>
                    <td>{e.model ?? e.toolName ?? "—"}</td>
                    <td className="num">
                      {e.costUsdCents != null
                        ? formatCost(e.costUsdCents)
                        : "—"}
                    </td>
                    <td className="muted" style={{ fontSize: 11 }}>
                      {e.errorText ?? e.decision ?? ""}
                    </td>
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
