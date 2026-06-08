import Link from "next/link";

import {
  apiCostByModel,
  apiCostByType,
  apiCostByWorkspace,
  apiCostDailyTrend,
  apiCostEstimatedByApiKey,
  apiCostTotalCents,
  messagesUsageSummary,
  type ApiCostBreakdownRow,
} from "@/lib/queries";
import {
  centsToUsd,
  formatCost,
  formatTokens,
  formatUsd,
  isoDateMinusDays,
} from "@/lib/format";
import { CostTrendChart } from "./cost-trend-chart";

export const dynamic = "force-dynamic";

const PRESETS = [
  { label: "過去 7 日", days: 7 },
  { label: "過去 30 日", days: 30 },
  { label: "過去 90 日", days: 90 },
];

const COST_TYPE_JA: Record<string, string> = {
  tokens: "トークン",
  web_search: "Web 検索",
  code_execution: "コード実行",
  session_usage: "セッション",
};

// 構成比つきの内訳テーブル（モデル別 / コスト種別で共用）。
function BreakdownTable({
  rows,
  total,
  labelHead,
  renderLabel,
}: {
  rows: ApiCostBreakdownRow[];
  total: number;
  labelHead: string;
  renderLabel?: (label: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="muted">データなし</p>;
  }
  return (
    <div className="table-scroll">
      <table className="usage-table">
        <thead>
          <tr>
            <th>{labelHead}</th>
            <th className="num">金額</th>
            <th className="num">構成比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const share = total > 0 ? (r.costCents / total) * 100 : 0;
            return (
              <tr key={r.label}>
                <td>{renderLabel ? renderLabel(r.label) : r.label}</td>
                <td className="num">{formatUsd(r.costCents)}</td>
                <td className="num">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 60,
                        height: 6,
                        borderRadius: 3,
                        background: "rgba(53,54,45,0.10)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: `${share}%`,
                          background: "var(--chart-2, #D4772C)",
                          borderRadius: 3,
                        }}
                      />
                    </span>
                    {share.toFixed(1)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ApiMessagesPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await props.searchParams;
  const range = Math.max(1, Math.min(180, Number(days) || 30));
  const fromDate = isoDateMinusDays(range);
  const toDate = isoDateMinusDays(0);

  const [totalCents, byWorkspace, byModel, byType, trend, rows, byApiKey] =
    await Promise.all([
      apiCostTotalCents({ fromDate, toDate }),
      apiCostByWorkspace({ fromDate, toDate }),
      apiCostByModel({ fromDate, toDate }),
      apiCostByType({ fromDate, toDate }),
      apiCostDailyTrend({ fromDate, toDate }),
      messagesUsageSummary({ fromDate, toDate }),
      apiCostEstimatedByApiKey({ fromDate, toDate }),
    ]);

  // workspace 名解決用マップ（apiCostByWorkspace が既に持っているので流用）。
  const workspaceNameById = new Map<string, string>();
  for (const w of byWorkspace) {
    if (w.workspaceId) workspaceNameById.set(w.workspaceId, w.name);
  }
  const apiKeyTotalCents = byApiKey.reduce(
    (s, r) => s + r.costCentsEstimated,
    0
  );
  const hasAnyUnknownModel = byApiKey.some((r) => r.hasUnknownModel);
  // 推計合計 vs 実額合計のズレ %（実額が 0 の場合は表示しない）
  const estimationDiffPct =
    totalCents > 0
      ? ((apiKeyTotalCents - totalCents) / totalCents) * 100
      : null;

  const [totalUsd, totalJpy] = formatCost(totalCents).split(" / ");
  const topModel = byModel[0]?.label ?? "—";
  const trendData = trend.map((p) => ({
    date: p.date,
    costUsd: centsToUsd(p.costCents),
  }));

  return (
    <>
      <h1 className="page-title">コンソール API</h1>
      <p className="page-subtitle">
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。
        console.anthropic.com 側の従量課金（Cost Report API の実課金額）を
        プロジェクト（Workspace）別に集計。Team 座席費とは別系統。
      </p>

      <div className="flex-row" style={{ marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <Link
            key={p.days}
            className={`btn${p.days === range ? " btn--quiet-active" : ""}`}
            href={`/api-messages?days=${p.days}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <section className="kpi-hero-grid">
        <div className="kpi-hero">
          <p className="kpi-label">期間合計コスト</p>
          <p className="kpi-value">{totalUsd}</p>
          <p className="kpi-sub">{totalJpy}</p>
        </div>
        <div className="card">
          <p className="kpi-label">プロジェクト数</p>
          <p className="kpi-value">{byWorkspace.length}</p>
          <p className="kpi-sub">課金のある Workspace</p>
        </div>
        <div className="card">
          <p className="kpi-label">最大支出モデル</p>
          <p className="kpi-value" style={{ fontSize: 20 }}>{topModel}</p>
          <p className="kpi-sub">
            {byModel[0] ? formatUsd(byModel[0].costCents) : "—"}
          </p>
        </div>
      </section>

      <section className="glass-panel">
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>日次コスト推移</h2>
        {trendData.length === 0 ? (
          <p className="muted">
            データがありません。<code>/api/sync?source=cost</code> を実行してください。
          </p>
        ) : (
          <CostTrendChart data={trendData} />
        )}
      </section>

      <section className="glass-panel">
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>プロジェクト（Workspace）別コスト</h2>
        {byWorkspace.length === 0 ? (
          <p className="muted">
            データがありません。<code>/api/sync?source=cost</code> と
            <code>?source=workspaces</code> を実行してください。
          </p>
        ) : (
          <div className="table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>プロジェクト</th>
                  <th className="num">金額 (USD / JPY)</th>
                  <th className="num">構成比</th>
                </tr>
              </thead>
              <tbody>
                {byWorkspace.map((w) => {
                  const share =
                    totalCents > 0 ? (w.costCents / totalCents) * 100 : 0;
                  return (
                    <tr key={w.workspaceId || "default"}>
                      <td>
                        <div>{w.name}</div>
                        {w.workspaceId ? (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {w.workspaceId}
                          </div>
                        ) : null}
                      </td>
                      <td className="num">
                        <strong>{formatCost(w.costCents)}</strong>
                      </td>
                      <td className="num">{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-panel">
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>API キー別 推計コスト</h2>
        <div className="callout" style={{ marginBottom: 16 }}>
          <strong>注意</strong>
          <span>
            これは <code>usage_report/messages</code> のトークン量に
            モデル単価を掛けた<strong>推計値</strong>です。
            Cost Report API は API キー粒度に対応していないため、正確な実額は{" "}
            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noreferrer"
            >
              console.anthropic.com
            </a>{" "}
            にログインして確認してください。
            {estimationDiffPct !== null && (
              <>
                <br />
                参考: 期間合計 推計 <strong>{formatUsd(apiKeyTotalCents)}</strong> ／
                実額 <strong>{formatUsd(totalCents)}</strong>
                （差 {estimationDiffPct >= 0 ? "+" : ""}
                {estimationDiffPct.toFixed(1)}%）
              </>
            )}
          </span>
        </div>
        {byApiKey.length === 0 ? (
          <p className="muted">
            データがありません。<code>/api/sync?source=messages</code> を実行してください。
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>api_key</th>
                    <th>workspace</th>
                    <th>最大モデル</th>
                    <th className="num">推計 USD</th>
                    <th className="num">トークン合計</th>
                    <th className="num">構成比</th>
                  </tr>
                </thead>
                <tbody>
                  {byApiKey.map((r) => {
                    const share =
                      apiKeyTotalCents > 0
                        ? (r.costCentsEstimated / apiKeyTotalCents) * 100
                        : 0;
                    const totalTokens =
                      r.tokensInput +
                      r.tokensOutput +
                      r.tokensCacheRead +
                      r.tokensCacheCreation;
                    const wsName =
                      workspaceNameById.get(r.workspaceId) ??
                      (r.workspaceId || "default workspace");
                    return (
                      <tr key={`${r.apiKeyId}|${r.workspaceId}`}>
                        <td>
                          <div>{r.apiKeyId || "—"}</div>
                          {r.hasUnknownModel && (
                            <div
                              className="muted"
                              style={{ fontSize: 11 }}
                              title="単価表に無いモデルが含まれているため Sonnet 単価で代用"
                            >
                              ※ 未知モデル含む
                            </div>
                          )}
                        </td>
                        <td>
                          <div>{wsName}</div>
                          {r.workspaceId && r.workspaceId !== wsName ? (
                            <div className="muted" style={{ fontSize: 11 }}>
                              {r.workspaceId}
                            </div>
                          ) : null}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {r.modelTop}
                        </td>
                        <td className="num">
                          <strong>{formatUsd(r.costCentsEstimated)}</strong>
                        </td>
                        <td className="num">{formatTokens(totalTokens)}</td>
                        <td className="num">
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                display: "inline-block",
                                width: 60,
                                height: 6,
                                borderRadius: 3,
                                background: "rgba(53,54,45,0.10)",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  width: `${share}%`,
                                  background: "var(--chart-2, #D4772C)",
                                  borderRadius: 3,
                                }}
                              />
                            </span>
                            {share.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hasAnyUnknownModel && (
              <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
                ※ 単価表に無いモデルが含まれる行は Sonnet 単価で代用しています。
                該当モデルが定常的に出る場合は <code>src/lib/pricing.ts</code> に
                追記してください。
              </p>
            )}
          </>
        )}
      </section>

      <section className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", display: "grid", gap: 16 }}>
        <div className="glass-panel">
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>モデル別</h2>
          <BreakdownTable rows={byModel} total={totalCents} labelHead="モデル" />
        </div>
        <div className="glass-panel">
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>コスト種別</h2>
          <BreakdownTable
            rows={byType}
            total={totalCents}
            labelHead="種別"
            renderLabel={(l) => COST_TYPE_JA[l] ?? l}
          />
        </div>
      </section>

      <section className="glass-panel">
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>トークン明細</h2>
        <div className="callout" style={{ marginBottom: 16 }}>
          <strong>注意</strong>
          <span>
            こちらは <code>usage_report/messages</code> のトークン集計（金額ではなく数量）。
            account / workspace / api_key / model 粒度。ユーザー別の紐付けは Team プランでは返りません。
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="muted">
            データがありません。<code>/api/sync?source=messages</code> を実行してください。
          </p>
        ) : (
          <div className="table-scroll">
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
                        <td className="num">{formatTokens(r.tokensCacheCreation)}</td>
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
      </section>
    </>
  );
}
