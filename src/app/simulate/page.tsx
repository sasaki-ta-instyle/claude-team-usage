import { jpyPerUsd, isoDateMinusDays, monthStartIso } from "@/lib/format";
import { combinedMemberSummary } from "@/lib/cowork-queries";
import { Simulator } from "./simulator";

export const dynamic = "force-dynamic";

export default async function SimulatePage() {
  const fromDate = monthStartIso();
  const toDate = isoDateMinusDays(0);
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date();
  const members = await combinedMemberSummary({ from, to });

  return (
    <>
      <h1 className="page-title">配分シミュレーション</h1>
      <p className="page-subtitle">
        当月の Cowork + Claude Code 使用量から Premium ($125) / Standard ($25) の候補配分を試算。
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。
      </p>
      <Simulator
        members={members.map((m) => ({
          email: m.email,
          displayName: null,
          seatType: null,
          tokens: m.totalTokens,
          costCents: m.totalCostCents,
          coworkCostCents: m.coworkCostCents,
          codeCostCents: m.codeCostCents,
        }))}
        jpyPerUsd={jpyPerUsd()}
      />
    </>
  );
}
