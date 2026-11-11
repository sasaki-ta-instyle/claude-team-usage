import { jpyPerUsd, isoDateMinusDays, monthStartIso } from "@/lib/format";
import { eventsDataStart, rosterMemberSummary } from "@/lib/cowork-queries";
import { effectiveRangeDays } from "@/lib/seat-recommendation";
import { Simulator } from "./simulator";

export const dynamic = "force-dynamic";

export default async function SimulatePage() {
  const fromDate = monthStartIso();
  const toDate = isoDateMinusDays(0);
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date();
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
      rateLimitDays: m.rateLimitDays,
      workPeaksCents: m.workPeaksCents,
    }));

  return (
    <>
      <h1 className="page-title">配分シミュレーション</h1>
      <p className="page-subtitle">
        当月の Cowork + Claude Code 使用量から Premium ($125) / Standard ($25) の候補配分を試算。
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>（{rangeDays.toFixed(1)} 日分。当月途中は日数を引き伸ばさず、そのまま月の基準と比べる）。
      </p>
      <Simulator members={members} rangeDays={rangeDays} jpyPerUsd={jpyPerUsd()} />
    </>
  );
}
