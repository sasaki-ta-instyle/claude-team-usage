import { jpyPerUsd, trailingDays } from "@/lib/format";
import { eventsDataStart, rosterMemberSummary } from "@/lib/cowork-queries";
import { SEAT_REVIEW_DAYS, effectiveRangeDays } from "@/lib/seat-recommendation";
import { Simulator } from "./simulator";

export const dynamic = "force-dynamic";

export default async function SimulatePage() {
  const { from, to, fromLabel: fromDate, toLabel: toDate } = trailingDays(SEAT_REVIEW_DAYS);
  const [rows, dataStart] = await Promise.all([
    rosterMemberSummary({ from, to }),
    eventsDataStart(),
  ]);
  const rangeDays = effectiveRangeDays(from, to, dataStart);

  // シート配分の試算なので母集団はロスター（シート保有者）のみ。
  // 当月利用 0 の人も rosterMemberSummary が 0 値行で含めている。
  const members = rows
    .filter((m) => m.inRoster)
    .map((m) => ({
      email: m.email,
      displayName: m.displayName,
      seatType: m.seatType,
      tokens: m.totalTokens,
      costCents: m.totalCostCents,
      coworkCostCents: m.coworkCostCents,
      codeCostCents: m.codeCostCents,
      coworkPrompts: m.coworkPrompts,
      codePrompts: m.codePrompts,
      rateLimitHits: m.rateLimitHits,
      workCostCents: m.workCostCents,
      workPeaksCents: m.workPeaksCents,
    }));

  return (
    <>
      <h1 className="page-title">配分シミュレーション</h1>
      <p className="page-subtitle">
        直近 {SEAT_REVIEW_DAYS} 日の Cowork + Claude Code 使用量から Premium ($125) / Standard ($25) の候補配分を試算。
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。
      </p>
      <Simulator members={members} rangeDays={rangeDays} jpyPerUsd={jpyPerUsd()} />
    </>
  );
}
