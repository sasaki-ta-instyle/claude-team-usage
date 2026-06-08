// Anthropic API のモデル別単価表（per 1M tokens, USD）。
// 出典: https://www.anthropic.com/pricing
// 最終確認日: 2026-06-08
//
// この単価は手動メンテ。Anthropic 側で価格改定があったらこのファイルを直す。
// Cost Report API は API キー粒度の group_by を返さないため、API キー別の USD は
// このテーブルを使った推計値で代用する（実額は console.anthropic.com を見る運用）。
//
// service_tier="batch" は 50% 引き。"standard" / null / その他はそのまま。

export type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
};

export const MODEL_PRICES_PER_M_USD: Record<string, ModelPrice> = {
  // Opus 4.x（最新 4.8 と現行 4.7 は同一料金）
  "claude-opus-4-8": { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  // Sonnet 4.6
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  // Haiku 4.5
  "claude-haiku-4-5": { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
};

// 未知モデルの fallback（Sonnet 単価）。
const FALLBACK_PRICE: ModelPrice = MODEL_PRICES_PER_M_USD["claude-sonnet-4-6"];

// 入力モデル名を正規化（service_tier suffix / "us." prefix / リビジョン違いに耐性）。
// 例: "us.anthropic.claude-opus-4-7-20251022" → "claude-opus-4-7"
function normalizeModelKey(model: string): string {
  const m = model.toLowerCase();
  for (const key of Object.keys(MODEL_PRICES_PER_M_USD)) {
    if (m.includes(key)) return key;
  }
  return "";
}

export function lookupPrice(model: string): { price: ModelPrice; isKnown: boolean } {
  const key = normalizeModelKey(model);
  if (key) return { price: MODEL_PRICES_PER_M_USD[key], isKnown: true };
  return { price: FALLBACK_PRICE, isKnown: false };
}

// トークン量 × 単価で推計 USD を cents で返す。
// 戻り値の cents は小数を含む可能性があるため Math.round で丸める。
export function estimateCostCents(args: {
  model: string;
  serviceTier?: string | null;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number;
  tokensCacheCreation: number;
}): { cents: number; isUnknownModel: boolean } {
  const { price, isKnown } = lookupPrice(args.model || "");
  const usd =
    (args.tokensInput / 1_000_000) * price.input +
    (args.tokensOutput / 1_000_000) * price.output +
    (args.tokensCacheRead / 1_000_000) * price.cacheRead +
    (args.tokensCacheCreation / 1_000_000) * price.cacheCreation;
  const batchDiscount = args.serviceTier === "batch" ? 0.5 : 1;
  const cents = Math.round(usd * 100 * batchDiscount);
  return { cents, isUnknownModel: !isKnown };
}
