"use client";

import { useMemo, useState } from "react";

import { formatTokens } from "@/lib/format";

type Member = {
  email: string;
  displayName: string | null;
  seatType: string | null;
  tokens: number;
  costCents: number;
};

const PRESETS = [
  { label: "$25 を超えたら Premium", value: 25 },
  { label: "$50 (推奨)", value: 50 },
  { label: "$100", value: 100 },
  { label: "$125 以上のみ Premium", value: 125 },
];

const PREMIUM_MONTHLY_USD = 125;
const STANDARD_MONTHLY_USD = 25;

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
  const [threshold, setThreshold] = useState<number>(50);

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
      const recommend = m.costCents >= thresholdCents ? "premium" : "standard";
      const planCost = recommend === "premium" ? PREMIUM_MONTHLY_USD : STANDARD_MONTHLY_USD;
      const currentCost =
        m.seatType === "premium"
          ? PREMIUM_MONTHLY_USD
          : m.seatType === "standard"
            ? STANDARD_MONTHLY_USD
            : 0;
      return {
        ...m,
        recommend,
        planCost,
        currentCost,
        deltaUsd: planCost - currentCost,
      };
    });

    const premiumCount = rows.filter((r) => r.recommend === "premium").length;
    const standardCount = rows.length - premiumCount;
    const totalPlanCost =
      premiumCount * PREMIUM_MONTHLY_USD + standardCount * STANDARD_MONTHLY_USD;
    const totalCurrentCost = rows.reduce((a, r) => a + r.currentCost, 0);

    return {
      rows: rows.sort((a, b) => b.costCents - a.costCents),
      premiumCount,
      standardCount,
      totalPlanCost,
      totalCurrentCost,
      deltaUsd: totalPlanCost - totalCurrentCost,
    };
  }, [members, threshold]);

  return (
    <>
      <section className="glass-panel">
        <h2 style={{ marginTop: 0 }}>
          閾値: 月コスト {fmtUsd(threshold)} 以上で Premium 推奨
        </h2>
        <div className="flex-row" style={{ marginBottom: 16 }}>
          {PRESETS.map((p) => (
            <button
              key={p.value}
              className={`btn${threshold === p.value ? " btn--primary" : ""}`}
              onClick={() => setThreshold(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex-row">
          <label className="muted" style={{ fontSize: 12 }}>
            カスタム: USD
          </label>
          <input
            className="input"
            type="number"
            min={0}
            max={500}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value) || 0)}
            style={{ width: 120 }}
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
      </section>

      <section className="kpi-grid" style={{ marginTop: 24 }}>
        <div className="card">
          <p className="kpi-label">Premium 推奨</p>
          <p className="kpi-value">{computed.premiumCount}</p>
          <p className="kpi-sub">@ $125/月</p>
        </div>
        <div className="card">
          <p className="kpi-label">Standard 推奨</p>
          <p className="kpi-value">{computed.standardCount}</p>
          <p className="kpi-sub">@ $25/月</p>
        </div>
        <div className="card">
          <p className="kpi-label">推奨配分の月額</p>
          <p className="kpi-value">{fmtUsd(computed.totalPlanCost)}</p>
          <p className="kpi-sub">{fmtJpy(computed.totalPlanCost)}</p>
        </div>
        <div className="card">
          <p className="kpi-label">現状との差分</p>
          <p
            className="kpi-value"
            style={{
              color:
                computed.deltaUsd > 0
                  ? "var(--color-warning)"
                  : "var(--color-success)",
            }}
          >
            {computed.deltaUsd >= 0 ? "+" : ""}
            {fmtUsd(computed.deltaUsd)}
          </p>
          <p className="kpi-sub">
            現状: {fmtUsd(computed.totalCurrentCost)} → 推奨:{" "}
            {fmtUsd(computed.totalPlanCost)}
          </p>
        </div>
      </section>

      <section className="glass-panel" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>メンバー別の推奨</h2>
        <table className="usage-table">
          <thead>
            <tr>
              <th>メンバー</th>
              <th className="num">月トークン</th>
              <th className="num">月コスト</th>
              <th>現状 seat</th>
              <th>推奨 seat</th>
              <th className="num">月差分</th>
            </tr>
          </thead>
          <tbody>
            {computed.rows.map((r) => (
              <tr key={r.email}>
                <td>
                  {r.displayName ?? r.email}
                  <div className="muted" style={{ fontSize: 11 }}>
                    {r.email}
                  </div>
                </td>
                <td className="num">{formatTokens(r.tokens)}</td>
                <td className="num">{fmtCost(r.costCents)}</td>
                <td>
                  <span className={`seat-badge seat-badge--${r.seatType ?? "null"}`}>
                    {r.seatType ?? "未設定"}
                  </span>
                </td>
                <td>
                  <span className={`seat-badge seat-badge--${r.recommend}`}>
                    {r.recommend}
                  </span>
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
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
