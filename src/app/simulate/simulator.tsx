"use client";

import { useMemo, useState } from "react";

import { formatTokens } from "@/lib/format";
import {
  DEFAULT_SEAT_POLICY,
  SEAT_RECO_META,
  recommendReason,
  recommendSeat,
  currentSeatMonthlyUsd,
  seatMonthlyUsd,
  seatSignals,
  type RateLimitHit,
  type SeatPolicy,
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
  rateLimitHits: RateLimitHit[];
  workCostCents: number;
  workPeaksCents: number[];
};

// 判定基準のプリセット。「標準」が既定（/members と同じ）。
const PRESETS: Array<{ key: string; label: string; policy: SeatPolicy }> = [
  { key: "strict", label: "厳しめ（1 日でも当たれば昇格）", policy: { limitHitDays: 1, peakCapCents: 3200, peakDays: 2 } },
  { key: "standard", label: "標準", policy: DEFAULT_SEAT_POLICY },
  { key: "evidence", label: "実績のみ（制限到達だけ）", policy: { limitHitDays: 2, peakCapCents: 4000, peakDays: Infinity } },
];

function fmtUsd(v: number) {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function Simulator({
  members,
  rangeDays,
  jpyPerUsd,
}: {
  members: Member[];
  rangeDays: number;
  jpyPerUsd: number;
}) {
  const [policy, setPolicy] = useState<SeatPolicy>(DEFAULT_SEAT_POLICY);
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
    const rows = members.map((m) => {
      const input = {
        totalCostCents: m.costCents,
        coworkPrompts: m.coworkPrompts,
        codePrompts: m.codePrompts,
        rateLimitHits: m.rateLimitHits,
        workPeaksCents: m.workPeaksCents,
      };
      let reco = recommendSeat(input, rangeDays, policy);
      // API 従量候補を集計外にしない場合は Standard として数える
      if (!treatApiDirectAsZero && reco === "api_direct_candidate") reco = "standard";
      const reason = recommendReason(reco, seatSignals(input, rangeDays, policy), policy);
      const planCost = seatMonthlyUsd(reco, m.seatType);
      const currentCost = currentSeatMonthlyUsd(m.seatType);
      return { ...m, reco, reason, planCost, currentCost, deltaUsd: planCost - currentCost };
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
      premiumCount: counts.premium,
      standardCount: counts.standard,
      apiDirectCount: counts.api_direct_candidate,
      unusedCount: counts.unused,
      totalPlanCost,
      totalCurrentCost,
      deltaUsd: totalPlanCost - totalCurrentCost,
    };
  }, [members, rangeDays, policy, treatApiDirectAsZero]);

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  return (
    <>
      <section className="glass-panel">
        <h2 style={{ marginTop: 0 }}>判定基準を設定する</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Premium と Standard の差は 5 時間ごとの利用上限。勤務時間（平日 10–18 時）に Standard の上限が
          仕事を止めている人だけ Premium にする。土日・時間外の利用と制限到達は換算しない。
          どちらかの条件（月あたり）を満たすと Premium 推奨。
        </p>

        <div className="flex-row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
          {PRESETS.map((p) => {
            const active =
              p.policy.limitHitDays === policy.limitHitDays &&
              p.policy.peakCapCents === policy.peakCapCents &&
              p.policy.peakDays === policy.peakDays;
            return (
              <button
                key={p.key}
                type="button"
                className={`btn${active ? " btn--quiet-active" : ""}`}
                onClick={() => setPolicy(p.policy)}
              >
                {p.label}
              </button>
            );
          })}
          <span className="spacer" />
          <div style={{ textAlign: "right", fontSize: 12, color: "var(--color-text-muted)" }}>
            <div>
              現状: <strong>{fmtUsd(computed.totalCurrentCost)}</strong> → 判定後:{" "}
              <strong>{fmtUsd(computed.totalPlanCost)}</strong>
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
              {fmtUsd(computed.deltaUsd)} / 月
            </div>
          </div>
        </div>

        <div className="flex-row" style={{ flexWrap: "wrap", gap: 16, fontSize: 13 }}>
          <label className="flex-row">
            勤務内の制限到達
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={policy.limitHitDays}
              onChange={(e) => setPolicy({ ...policy, limitHitDays: num(e.target.value, policy.limitHitDays) })}
              style={{ width: 72 }}
            />
            日以上
          </label>
          <span className="muted">または</span>
          <label className="flex-row">
            勤務時間に直前 5 時間で $
            <input
              className="input"
              type="number"
              min={0}
              step={5}
              value={policy.peakCapCents / 100}
              onChange={(e) =>
                setPolicy({ ...policy, peakCapCents: Math.round(num(e.target.value, policy.peakCapCents / 100) * 100) })
              }
              style={{ width: 80 }}
            />
            以上の日が
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={Number.isFinite(policy.peakDays) ? policy.peakDays : ""}
              placeholder="使わない"
              onChange={(e) =>
                setPolicy({ ...policy, peakDays: e.target.value === "" ? Infinity : num(e.target.value, policy.peakDays) })
              }
              style={{ width: 90 }}
            />
            日以上
          </label>
        </div>

        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid rgba(53, 54, 45, 0.08)",
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
              <strong>API 従量候補（月換算 &lt; $10）をシート集計から外す</strong>
              <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                Workspace API キーで従量運用に切り出し、$0 で計算
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
          <p className="kpi-label">API 直 / 利用未観測</p>
          <p className="kpi-value">
            {computed.apiDirectCount + computed.unusedCount}
          </p>
          <p className="kpi-sub">
            API 直 {computed.apiDirectCount}（$0 で試算）/ 未観測 {computed.unusedCount}（現状の席代のまま）
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
                    <td className="num">
                      <strong>{fmtCost(r.costCents)}</strong>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        （勤務内 {fmtUsd(r.workCostCents / 100)}）
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {r.reason}
                      </div>
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
