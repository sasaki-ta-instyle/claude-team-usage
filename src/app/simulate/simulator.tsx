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

const PRESETS = [25, 50, 100, 125];
const DEFAULT_THRESHOLD = 50;

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
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);

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
      const candidate =
        m.costCents >= thresholdCents ? "premium" : "standard";
      const planCost =
        candidate === "premium" ? PREMIUM_MONTHLY_USD : STANDARD_MONTHLY_USD;
      const currentCost =
        m.seatType === "premium"
          ? PREMIUM_MONTHLY_USD
          : m.seatType === "standard"
            ? STANDARD_MONTHLY_USD
            : 0;
      return {
        ...m,
        candidate,
        planCost,
        currentCost,
        deltaUsd: planCost - currentCost,
      };
    });

    const premiumCount = rows.filter((r) => r.candidate === "premium").length;
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
        <h2 style={{ marginTop: 0 }}>閾値を設定する</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          月コストがこの値以上のメンバーを Premium 候補と判定します。
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

        <div className="flex-row" style={{ marginBottom: 14 }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn${threshold === p ? " btn--quiet-active" : ""}`}
              onClick={() => setThreshold(p)}
            >
              ${p}
              {p === DEFAULT_THRESHOLD ? "（基準）" : ""}
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
          <p className="kpi-label">現状との差分</p>
          <p
            className="kpi-value"
            style={{
              color:
                computed.deltaUsd > 0
                  ? "var(--color-warning)"
                  : computed.deltaUsd < 0
                    ? "var(--color-success)"
                    : "var(--color-text)",
            }}
          >
            {computed.deltaUsd >= 0 ? "+" : ""}
            {fmtUsd(computed.deltaUsd)}
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
                <th className="num">月コスト</th>
                <th>現状 seat</th>
                <th>候補 seat</th>
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
                    <span className={`seat-badge seat-badge--${r.candidate}`}>
                      {r.candidate}
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
        </div>
      </section>
    </>
  );
}
