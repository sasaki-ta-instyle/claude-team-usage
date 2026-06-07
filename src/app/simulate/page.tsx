import { jpyPerUsd, isoDateMinusDays, monthStartIso } from "@/lib/format";
import { combinedMemberSummary } from "@/lib/cowork-queries";
import { usersRoster } from "@/lib/queries";
import { Simulator } from "./simulator";

export const dynamic = "force-dynamic";

export default async function SimulatePage() {
  const fromDate = monthStartIso();
  const toDate = isoDateMinusDays(0);
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date();
  const [members, roster] = await Promise.all([
    combinedMemberSummary({ from, to }),
    usersRoster(),
  ]);

  const seatByEmail = new Map(roster.map((u) => [u.email, u]));
  // events 集計に出てこないシート保有者（当月利用 0）も unused として含める
  const eventEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const zeroRows = roster
    .filter((u) => !eventEmails.has(u.email))
    .map((u) => ({
      email: u.email,
      displayName: u.displayName,
      seatType: u.seatType,
      tokens: 0,
      costCents: 0,
      coworkCostCents: 0,
      codeCostCents: 0,
      coworkPrompts: 0,
      codePrompts: 0,
    }));
  const activeRows = members.map((m) => {
    const u = seatByEmail.get(m.email.toLowerCase());
    return {
      email: m.email,
      displayName: u?.displayName ?? null,
      seatType: u?.seatType ?? null,
      tokens: m.totalTokens,
      costCents: m.totalCostCents,
      coworkCostCents: m.coworkCostCents,
      codeCostCents: m.codeCostCents,
      coworkPrompts: m.coworkPrompts,
      codePrompts: m.codePrompts,
    };
  });

  return (
    <>
      <h1 className="page-title">配分シミュレーション</h1>
      <p className="page-subtitle">
        当月の Cowork + Claude Code 使用量から Premium ($125) / Standard ($25) の候補配分を試算。
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>。
      </p>
      <Simulator
        members={[...activeRows, ...zeroRows]}
        jpyPerUsd={jpyPerUsd()}
      />
    </>
  );
}
