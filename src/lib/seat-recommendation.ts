// Seat 推奨ロジック。
//
// Premium と Standard の違いは「5 時間ローリング窓の利用上限」の高さ。勤務は 10–18 時（平日）なので、
// 月のコスト総額よりも「勤務時間中に Standard の上限が仕事を止めているか」で判定する。
// 土日・時間外の利用は Premium 判定に換算しない（制限到達も 5h 窓の利用額も勤務時間内の分だけ）。
//
//   premium              … 次のどちらか（月あたり）
//                          ・勤務時間内の制限到達（api_error かつ HTTP 429）が LIMIT_HIT_DAYS 日以上
//                          ・勤務時間内の利用だけで数えた「直前 5 時間の利用額」が PEAK_CAP 以上に達した日が
//                            PEAK_DAYS 日以上
//                            （PEAK_CAP は Standard が実際に 429 になった直前 5h 利用額 ≈ $30–48 から置いた目安）
//   api_direct_candidate … 月換算コスト < $10（Standard $25 を割る軽利用）
//   unused               … Cowork / Code のコスト 0 かつプロンプト 0（= 利用未観測）。
//                          claude.ai の Chat 利用は計測できないので「使っていない」とは断定しない
//   standard             … それ以外（月コストが大きくても上限に当たっていなければ Standard で足りる）
//
// 日数は「月あたり」に揃える。期間が 1 ヶ月より長い（90 日など）ときは月平均に縮めるが、
// 短い期間（7 日・当月途中）は引き伸ばさない（数日分の 1 回を月 4 回扱いにしない）。

export type SeatRecommendation =
  | "premium"
  | "standard"
  | "api_direct_candidate"
  | "unused";

export type SeatPolicy = {
  limitHitDays: number; // 勤務時間内の制限到達日数（月）がこれ以上なら Premium
  peakCapCents: number; // 勤務時間内 5h 窓の利用額がこれ以上の日を「上限付近の日」とみなす
  peakDays: number; // 上限付近の日（月）がこれ以上なら Premium
};

export const DEFAULT_SEAT_POLICY: SeatPolicy = {
  limitHitDays: 2,
  peakCapCents: 4000, // $40
  peakDays: 4,
};

export const WORK_HOURS_JST = { startHour: 10, endHour: 18 } as const; // 平日 10:00–17:59

// 制限到達が起きた時間帯。1 日に複数あれば「勤務時間内 > 時間外」の順で代表させる（土日は土日）
export type RateLimitSlot = "work" | "after" | "weekend";
export type RateLimitHit = {
  date: string; // YYYY-MM-DD（JST）
  dow: string; // 月〜日
  time: string; // HH:MM（JST）。勤務時間内の到達があればその最初の時刻
  slot: RateLimitSlot;
};
export const RATE_LIMIT_SLOT_META: Record<RateLimitSlot, { label: string; badge: string }> = {
  work: { label: "勤務内", badge: "badge-warning" },
  after: { label: "時間外", badge: "badge-default" },
  weekend: { label: "土日", badge: "badge-accent" },
};
export const API_DIRECT_CENTS = 1000; // $10

// seat 配分の見直しに使う期間（直近 N 日）。日数系の基準（月 2 日・4 日）は 1 ヶ月分のデータを前提にしているので、
// 当月途中（月初は数日分しかない）ではなく常に直近 30 日で判定する（/・/simulate・/members の既定）。
export const SEAT_REVIEW_DAYS = 30;

export const PREMIUM_MONTHLY_USD = 125;
export const STANDARD_MONTHLY_USD = 25;

export const SEAT_RECO_META: Record<
  SeatRecommendation,
  { label: string; badge: string }
> = {
  premium: { label: "Premium 推奨", badge: "badge-success" },
  standard: { label: "Standard 維持", badge: "badge-info" },
  api_direct_candidate: { label: "API 従量候補", badge: "badge-warning" },
  unused: { label: "利用未観測（Chat は計測外）", badge: "badge-default" },
};

export type SeatRecoInput = {
  totalCostCents: number;
  coworkPrompts: number;
  codePrompts: number;
  rateLimitHits: RateLimitHit[]; // 期間内の制限到達日（時間帯つき）。判定には slot=work だけ使う
  workPeaksCents: number[]; // 勤務時間内の各日の「直前 5h 利用額（勤務時間内の分のみ）」の最大値
};

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

// 日数系シグナルの月あたり換算（長い期間は縮め、短い期間は引き伸ばさない）。
// 小数 1 桁に丸めた値を表示にも判定にも使う（「過去 30 日」は平均月長 30.44 日より
// わずかに長く、2 日 → 1.99 日で閾値 2 を割る、という見た目と判定のズレを防ぐ）。
export function perMonthDays(days: number, rangeDays: number): number {
  if (!(rangeDays > 0)) throw new Error(`invalid rangeDays: ${rangeDays}`);
  return Math.round(days * Math.min(1, DAYS_PER_MONTH / rangeDays) * 10) / 10;
}

export type SeatSignals = {
  monthlyCostCents: number;
  limitHitDaysPerMonth: number;
  peakDaysPerMonth: number;
  maxPeakCents: number;
};

export function seatSignals(
  input: SeatRecoInput,
  rangeDays: number,
  policy: SeatPolicy = DEFAULT_SEAT_POLICY
): SeatSignals {
  const peakDays = input.workPeaksCents.filter((c) => c >= policy.peakCapCents).length;
  return {
    monthlyCostCents: monthlyCostCents(input.totalCostCents, rangeDays),
    limitHitDaysPerMonth: perMonthDays(
      input.rateLimitHits.filter((h) => h.slot === "work").length,
      rangeDays
    ),
    peakDaysPerMonth: perMonthDays(peakDays, rangeDays),
    maxPeakCents: input.workPeaksCents.reduce((a, c) => Math.max(a, c), 0),
  };
}

export function recommendSeat(
  input: SeatRecoInput,
  rangeDays: number,
  policy: SeatPolicy = DEFAULT_SEAT_POLICY
): SeatRecommendation {
  const totalPrompts = input.coworkPrompts + input.codePrompts;
  if (input.totalCostCents === 0 && totalPrompts === 0) return "unused";
  const s = seatSignals(input, rangeDays, policy);
  if (s.limitHitDaysPerMonth >= policy.limitHitDays || s.peakDaysPerMonth >= policy.peakDays) {
    return "premium";
  }
  if (s.monthlyCostCents < API_DIRECT_CENTS && totalPrompts > 0) return "api_direct_candidate";
  return "standard";
}

// なぜその判定になったかの短い説明（表の補足表示用）
export function recommendReason(
  reco: SeatRecommendation,
  s: SeatSignals,
  policy: SeatPolicy = DEFAULT_SEAT_POLICY
): string {
  const usd = (c: number) => `$${(c / 100).toFixed(0)}`;
  const peakLabel = `勤務時間 5h ${usd(policy.peakCapCents)}+`;
  switch (reco) {
    case "unused":
      return "Cowork / Code の利用 0。Chat 利用は本人に確認";
    case "api_direct_candidate":
      return `月換算 ${usd(s.monthlyCostCents)}（< ${usd(API_DIRECT_CENTS)}）`;
    case "premium":
    case "standard":
      return `勤務内の制限到達 ${fmtDays(s.limitHitDaysPerMonth)} 日 / ${peakLabel} ${fmtDays(s.peakDaysPerMonth)} 日（月あたり）`;
  }
}

function fmtDays(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function currentSeatMonthlyUsd(seat: string | null): number {
  return seat === "premium" ? PREMIUM_MONTHLY_USD : seat === "standard" ? STANDARD_MONTHLY_USD : 0;
}

// 判定後のシート単価（月額 USD）。api_direct_candidate は 0（API 従量に切り出す想定）。
// unused（利用未観測）は Chat だけ使っている可能性があるので、確認が取れるまで現状の席代を据え置く
// （観測できない利用を「削減できる費用」として数えない）。
export function seatMonthlyUsd(reco: SeatRecommendation, currentSeat: string | null): number {
  switch (reco) {
    case "premium":
      return PREMIUM_MONTHLY_USD;
    case "standard":
      return STANDARD_MONTHLY_USD;
    case "api_direct_candidate":
      return 0;
    case "unused":
      return currentSeatMonthlyUsd(currentSeat);
  }
}
