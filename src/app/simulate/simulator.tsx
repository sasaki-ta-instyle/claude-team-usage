"use client";

import { useMemo, useState } from "react";

import { formatTokens } from "@/lib/format";
import {
  PREMIUM_MONTHLY_USD,
  STANDARD_MONTHLY_USD,
  SEAT_RECO_META,
  recommendSeatForSimulator,
  seatMonthlyUsd,
  type SeatRecommendation,
} from "@/lib/seat-recommendation";

type Member = {
  email: string;
  displayName: string | null;
  seatType: string | null;
  tokens: number;
  costCents: number;
  coworkCostCents: number;
  codeCostCents: number;
  coworkPrompts: number;
  codePrompts: number;
};

const PRESETS: Array<{ value: number; label: string }> = [
  { value: 25, label: "Standard 月額" },
  { value: 50, label: "保守的" },
  { value: 100, label: "損益分岐（既定）" },
  { value: 125, label: "Premium 月額" },
];
const DEFAULT_THRESHOLD = 100;

function fmtUsd(v: number) {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function Simulator({
  members,
  jpyPerUsd,
}: {
  members: Member[];
  jpyPerUsd: number;
}) {
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [treatApiDirectAsZero, setTreatApiDirectAsZero] = useState<boolean>(true);

  const fmtJpy = (usd: number) =>
    (usd * jpyPerUsd).toLocaleString("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    });

  const fmtCost = (cents: number) => {
    const usd = cents / 100;
    return `${fmtUsd(usd)} / ${fmtJpy(usd)}`;
  };

  const computed = useMemo(() => {
    const thresholdCents = Math.round(threshold * 100);
    const rows = members.map((m) => {
      const reco = recommendSeatForSimulator(
        {
          coworkCostCents: m.coworkCostCents,
          codeCostCents: m.codeCostCents,
          totalCostCents: m.costCents,
          coworkPrompts: m.coworkPrompts,
          codePrompts: m.codePrompts,
        },
        thresholdCents,
        { treatApiDirectAsZero }
      );
      const planCost = seatMonthlyUsd(reco);
      const currentCost =
        m.seatType === "premium"
          ? PREMIUM_MONTHLY_USD
          : m.seatType === "standard"
            ? STANDARD_MONTHLY_USD
            : 0;
      return {
        ...m,
        reco,
        planCost,
        currentCost,
        deltaUsd: planCost - currentCost,
      };
    });

    const counts: Record<SeatRecommendation, number> = {
      premium: 0,
      standard: 0,
      api_direct_candidate: 0,
      unused: 0,
    };
    for (const r of rows) counts[r.reco]++;

    const totalPlanCost = rows.reduce((a, r) => a + r.planCost, 0);
    const totalCurrentCost = rows.reduce((a, r) => a + r.currentCost, 0);

    return {
      rows: rows.sort((a, b) => b.costCents - a.costCents),
      counts,
      premiumCount: counts.premium,
      standardCount: counts.standard,
      apiDirectCount: counts.api_direct_candidate,
      unusedCount: counts.unused,
      totalPlanCost,
      totalCurrentCost,
      deltaUsd: totalPlanCost - totalCurrentCost,
    };
  }, [members, threshold, treatApiDirectAsZero]);

  return (
    <>
      <section className="glass-panel">
        <h2 style={{ marginTop: 0 }}>閾値を設定する</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          月コスト（Cowork + Code 合算）がこの値以上のメンバーを Premium 推奨と判定します。
          損益分岐は <strong>$100</strong>（差額 $100/seat/月の回収ライン）。
        </p>

        <div
          className="flex-row"
          style={{ marginTop: 18, marginBottom: 22, alignItems: "flex-end" }}
        >
          <div className="threshold-readout">
            {fmtUsd(threshold)}
            <small>現在の閾値</small>
          </div>
          <span className="spacer" />
          <div style={{ textAlign: "right", fontSize: 12, color: "var(--color-text-muted)" }}>
            <div>
              現状: <strong>{fmtUsd(computed.totalCurrentCost)}</strong>
            </div>
            <div>
              判定後: <strong>{fmtUsd(computed.totalPlanCost)}</strong>
            </div>
            <div
              style={{
                marginTop: 4,
                color:
                  computed.deltaUsd > 0
                    ? "var(--color-warning)"
                    : computed.deltaUsd < 0
                      ? "var(--color-success)"
                      : "var(--color-text)",
              }}
            >
              差分: {computed.deltaUsd >= 0 ? "+" : ""}
              {fmtUsd(computed.deltaUsd)}
            </div>
          </div>
        </div>

        <div className="flex-row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`btn${threshold === p.value ? " btn--quiet-active" : ""}`}
              onClick={() => setThreshold(p.value)}
              title={p.label}
            >
              ${p.value}
              <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>
                {p.label}
              </span>
            </button>
          ))}
        </div>
        <div className="flex-row">
          <label className="muted" style={{ fontSize: 12 }}>
            カスタム USD
          </label>
          <input
            className="input"
            type="number"
            min={0}
            max={500}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value) || 0)}
            style={{ width: 100 }}
          />
          <input
            type="range"
            min={0}
            max={300}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid rgba(53, 54, 45, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 13,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={treatApiDirectAsZero}
              onChange={(e) => setTreatApiDirectAsZero(e.target.checked)}
            />
            <span>
              <strong>API 直渡し候補（月 &lt; $10）をシート集計から外す</strong>
              <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                Workspace API キー直渡しに切り出し、$0 で計算
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="kpi-hero-grid" style={{ marginTop: 24 }}>
        <div className="kpi-hero">
          <p className="kpi-label">判定後の月額</p>
          <p className="kpi-value">{fmtUsd(computed.totalPlanCost)}</p>
          <p className="kpi-sub">{fmtJpy(computed.totalPlanCost)}</p>
        </div>
        <div className="card">
          <p className="kpi-label">Premium 候補</p>
          <p className="kpi-value">{computed.premiumCount}</p>
          <p className="kpi-sub">@ $125/月</p>
        </div>
        <div className="card">
          <p className="kpi-label">Standard 候補</p>
          <p className="kpi-value">{computed.standardCount}</p>
          <p className="kpi-sub">@ $25/月</p>
        </div>
        <div className="card">
          <p className="kpi-label">シート外（API直/未使用）</p>
          <p className="kpi-value">
            {computed.apiDirectCount + computed.unusedCount}
          </p>
          <p className="kpi-sub">
            API 直 {computed.apiDirectCount} / 未使用 {computed.unusedCount}
          </p>
        </div>
      </section>

      <section className="glass-panel" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>メンバー別の候補配分</h2>
        <div className="table-scroll">
          <table className="usage-table">
            <thead>
              <tr>
                <th>メンバー</th>
                <th className="num">月トークン</th>
                <th className="num">Cowork コスト</th>
                <th className="num">Code コスト</th>
                <th className="num">合計コスト</th>
                <th>推奨 seat</th>
                <th className="num">月差分</th>
              </tr>
            </thead>
            <tbody>
              {computed.rows.map((r) => {
                const meta = SEAT_RECO_META[r.reco];
                const isApiDirect = r.reco === "api_direct_candidate";
                return (
                  <tr key={r.email} className={isApiDirect ? "row-warn" : undefined}>
                    <td>
                      {r.displayName ?? r.email}
                      <div className="muted" style={{ fontSize: 11 }}>
                        {r.email}
                      </div>
                    </td>
                    <td className="num">{formatTokens(r.tokens)}</td>
                    <td className="num">{fmtCost(r.coworkCostCents)}</td>
                    <td className="num">{fmtCost(r.codeCostCents)}</td>
                    <td className="num"><strong>{fmtCost(r.costCents)}</strong></td>
                    <td>
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                    </td>
                    <td
                      className="num"
                      style={{
                        color:
                          r.deltaUsd > 0
                            ? "var(--color-warning)"
                            : r.deltaUsd < 0
                              ? "var(--color-success)"
                              : "inherit",
                      }}
                    >
                      {r.deltaUsd > 0 ? "+" : ""}
                      {fmtUsd(r.deltaUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
