// Seat 推奨ロジック。Premium $125 / Standard $25（差額 $100）と
// Anthropic Team の構造（Standard = Cowork のみ / Premium = Cowork + Code + $200 Code credit）
// を踏まえて 5 値で判定する。
//
// 旧 PREMIUM_COST_CENTS_DEFAULT (= $50) は損益分岐を回収できない領域も
// Premium に倒していたため、$100 を基準に作り直す。

export type SeatRecommendation =
  | "premium_required"
  | "premium_recommended"
  | "standard"
  | "api_direct_candidate"
  | "unused";

export const COWORK_HEAVY_CENTS = 10000; // $100 — Premium 損益分岐
export const API_DIRECT_CENTS = 1000; // $10 — Standard $25 を割る軽利用

export const PREMIUM_MONTHLY_USD = 125;
export const STANDARD_MONTHLY_USD = 25;

export const SEAT_RECO_META: Record<
  SeatRecommendation,
  { label: string; badge: string; helper: string }
> = {
  premium_required: {
    label: "Premium 必須",
    badge: "badge-success",
    helper: "Code 利用あり",
  },
  premium_recommended: {
    label: "Premium 推奨",
    badge: "badge-success",
    helper: "Cowork ≥ $100",
  },
  standard: {
    label: "Standard 維持",
    badge: "badge-info",
    helper: "",
  },
  api_direct_candidate: {
    label: "API 直渡し候補",
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

export function recommendSeat(input: SeatRecoInput): SeatRecommendation {
  const totalPrompts = input.coworkPrompts + input.codePrompts;
  if (input.totalCostCents === 0 && totalPrompts === 0) return "unused";
  if (input.codeCostCents > 0) return "premium_required";
  if (input.coworkCostCents >= COWORK_HEAVY_CENTS) return "premium_recommended";
  if (input.totalCostCents > 0 && input.totalCostCents < API_DIRECT_CENTS && totalPrompts > 0) {
    return "api_direct_candidate";
  }
  return "standard";
}

// シミュレータ用：Code 利用者を必ず Premium に倒すかどうかと、
// API 直渡し候補をシート集計から外すかどうかを切り替えられるバージョン。
// 通常表示（/members /）は recommendSeat を使う。
export function recommendSeatForSimulator(
  input: SeatRecoInput,
  thresholdCents: number,
  opts: { codeForcesPremium: boolean; treatApiDirectAsZero: boolean }
): SeatRecommendation {
  const totalPrompts = input.coworkPrompts + input.codePrompts;
  if (input.totalCostCents === 0 && totalPrompts === 0) return "unused";
  if (opts.codeForcesPremium && input.codeCostCents > 0) return "premium_required";
  if (input.totalCostCents >= thresholdCents) return "premium_recommended";
  if (
    opts.treatApiDirectAsZero &&
    input.totalCostCents > 0 &&
    input.totalCostCents < API_DIRECT_CENTS &&
    totalPrompts > 0
  ) {
    return "api_direct_candidate";
  }
  return "standard";
}

// シート単価（月額 USD）。api_direct_candidate と unused は 0 を返して
// 「シート 1 つ削減して API 直契約 / 停止に切り出した」想定で集計する。
export function seatMonthlyUsd(reco: SeatRecommendation): number {
  switch (reco) {
    case "premium_required":
    case "premium_recommended":
      return PREMIUM_MONTHLY_USD;
    case "standard":
      return STANDARD_MONTHLY_USD;
    case "api_direct_candidate":
    case "unused":
      return 0;
  }
}
