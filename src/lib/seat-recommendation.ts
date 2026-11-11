// Seat 推奨ロジック。Premium $125 / Standard $25（差額 $100）を踏まえて
// 合計コストで 4 値判定する。Code / Cowork の内訳は判定には使わない（表示のみ）。
//
// 旧 PREMIUM_COST_CENTS_DEFAULT (= $50) は損益分岐を回収できない領域も
// Premium に倒していたため、$100 を基準に作り直す。

export type SeatRecommendation =
  | "premium"
  | "standard"
  | "api_direct_candidate"
  | "unused";

export const PREMIUM_THRESHOLD_CENTS = 10000; // $100 — Premium 損益分岐
export const API_DIRECT_CENTS = 1000; // $10 — Standard $25 を割る軽利用

export const PREMIUM_MONTHLY_USD = 125;
export const STANDARD_MONTHLY_USD = 25;

export const SEAT_RECO_META: Record<
  SeatRecommendation,
  { label: string; badge: string; helper: string }
> = {
  premium: {
    label: "Premium 推奨",
    badge: "badge-success",
    helper: "月 ≥ $100",
  },
  standard: {
    label: "Standard 維持",
    badge: "badge-info",
    helper: "$10 – $100",
  },
  api_direct_candidate: {
    label: "API 従量候補",
    badge: "badge-warning",
    helper: "月 < $10",
  },
  unused: {
    label: "未使用（停止検討）",
    badge: "badge-default",
    helper: "プロンプト 0",
  },
};

export type SeatRecoInput = {
  coworkCostCents: number;
  codeCostCents: number;
  totalCostCents: number;
  coworkPrompts: number;
  codePrompts: number;
};

// 閾値（$100 / $10）は「月額」。集計期間が 1 ヶ月と異なる場合（7 日 / 90 日 / 当月途中）は
// 期間合計を 1 日あたりに均して平均月長に換算してから比較する。
export const DAYS_PER_MONTH = 365.25 / 12;
const DAY_MS = 24 * 60 * 60 * 1000;

// 換算に使う実効日数。from が実データ開始（dataStart）より前なら dataStart から数える
// （生イベントは月次運用で削除されるため、無い期間で割ると過小評価になる）。最小 1 日。
export function effectiveRangeDays(from: Date, to: Date, dataStart?: Date | null): number {
  const start = dataStart && dataStart > from ? dataStart : from;
  return Math.max(1, (to.getTime() - start.getTime()) / DAY_MS);
}

export function monthlyCostCents(totalCostCents: number, rangeDays: number): number {
  if (!(rangeDays > 0)) throw new Error(`invalid rangeDays: ${rangeDays}`);
  return Math.round((totalCostCents / rangeDays) * DAYS_PER_MONTH);
}

export function recommendSeat(input: SeatRecoInput, rangeDays: number): SeatRecommendation {
  return recommendSeatForSimulator(input, rangeDays, PREMIUM_THRESHOLD_CENTS, {
    treatApiDirectAsZero: true,
  });
}

// シミュレータ用：閾値を可変にし、API 従量候補をシート集計から外すかを切り替える。
export function recommendSeatForSimulator(
  input: SeatRecoInput,
  rangeDays: number,
  thresholdCents: number,
  opts: { treatApiDirectAsZero: boolean }
): SeatRecommendation {
  const totalPrompts = input.coworkPrompts + input.codePrompts;
  if (input.totalCostCents === 0 && totalPrompts === 0) return "unused";
  const monthly = monthlyCostCents(input.totalCostCents, rangeDays);
  if (monthly >= thresholdCents) return "premium";
  if (
    opts.treatApiDirectAsZero &&
    monthly > 0 &&
    monthly < API_DIRECT_CENTS &&
    totalPrompts > 0
  ) {
    return "api_direct_candidate";
  }
  return "standard";
}

// シート単価（月額 USD）。api_direct_candidate と unused は 0 を返して
// 「シート 1 つ削減して API 従量契約 / 停止に切り出した」想定で集計する。
export function seatMonthlyUsd(reco: SeatRecommendation): number {
  switch (reco) {
    case "premium":
      return PREMIUM_MONTHLY_USD;
    case "standard":
      return STANDARD_MONTHLY_USD;
    case "api_direct_candidate":
    case "unused":
      return 0;
  }
}
