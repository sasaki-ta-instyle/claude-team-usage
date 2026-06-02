import { jpyPerUsd, isoDateMinusDays, monthStartIso } from "@/lib/format";
import { memberSummary } from "@/lib/queries";
import { Simulator } from "./simulator";

export const dynamic = "force-dynamic";

export default async function SimulatePage() {
  const fromDate = monthStartIso();
  const toDate = isoDateMinusDays(0);
  const members = await memberSummary({ fromDate, toDate });

  return (
    <>
      <h1 className="page-title">配分シミュレーション</h1>
      <p className="page-subtitle">
        当月の Claude Code 使用量から Premium ($125) / Standard ($25) の候補配分を試算。
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。
      </p>
      <Simulator
        members={members.map((m) => ({
          email: m.email,
          displayName: m.displayName,
          seatType: m.seatType,
          tokens: m.tokens,
          costCents: m.costCents,
        }))}
        jpyPerUsd={jpyPerUsd()}
      />
    </>
  );
}
