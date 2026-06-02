export function jpyPerUsd(): number {
  const v = Number(process.env.JPY_PER_USD ?? "155");
  return Number.isFinite(v) && v > 0 ? v : 155;
}

export function centsToUsd(cents: number): number {
  return cents / 100;
}

export function formatUsd(cents: number): string {
  const usd = centsToUsd(cents);
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function formatJpyFromCents(cents: number): string {
  const jpy = centsToUsd(cents) * jpyPerUsd();
  return jpy.toLocaleString("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  });
}

export function formatCost(cents: number): string {
  return `${formatUsd(cents)} / ${formatJpyFromCents(cents)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

export function isoDateMinusDays(days: number, base = new Date()): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function monthStartIso(base = new Date()): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
}
