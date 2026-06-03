import type { CoworkMemberRow } from "./cowork-queries";

export const COWORK_MOCK_MEMBERS: CoworkMemberRow[] = [
  { email: "sasaki-ta@instyle.group", promptCount: 184, apiRequestCount: 412, apiErrorCount: 3, toolUseCount: 96, toolRejectCount: 4, totalCostCents: 12_400, inputTokens: 2_840_000, outputTokens: 720_000, firstSeen: "2026-05-15T09:12:00Z", lastSeen: "2026-06-02T18:44:00Z" },
  { email: "yamada@instyle.group", promptCount: 132, apiRequestCount: 281, apiErrorCount: 1, toolUseCount: 64, toolRejectCount: 2, totalCostCents: 8_900, inputTokens: 1_980_000, outputTokens: 510_000, firstSeen: "2026-05-18T10:20:00Z", lastSeen: "2026-06-02T17:18:00Z" },
  { email: "nakano@instyle.group", promptCount: 96, apiRequestCount: 198, apiErrorCount: 0, toolUseCount: 38, toolRejectCount: 1, totalCostCents: 5_200, inputTokens: 1_120_000, outputTokens: 290_000, firstSeen: "2026-05-22T14:33:00Z", lastSeen: "2026-06-01T13:09:00Z" },
  { email: "fujita@instyle.group", promptCount: 41, apiRequestCount: 73, apiErrorCount: 2, toolUseCount: 9, toolRejectCount: 0, totalCostCents: 1_840, inputTokens: 420_000, outputTokens: 110_000, firstSeen: "2026-05-28T11:01:00Z", lastSeen: "2026-06-02T09:42:00Z" },
];

export function mockCoworkOverall() {
  const sum = COWORK_MOCK_MEMBERS.reduce(
    (a, m) => ({
      uniqueUsers: a.uniqueUsers + 1,
      promptCount: a.promptCount + m.promptCount,
      apiErrorCount: a.apiErrorCount + m.apiErrorCount,
      totalCostCents: a.totalCostCents + m.totalCostCents,
      totalTokens: a.totalTokens + m.inputTokens + m.outputTokens,
    }),
    { uniqueUsers: 0, promptCount: 0, apiErrorCount: 0, totalCostCents: 0, totalTokens: 0 }
  );
  return sum;
}

export function mockCoworkRecentEvents() {
  const base = new Date("2026-06-02T18:44:00Z").getTime();
  return [
    { id: 901, occurredAt: new Date(base), eventName: "user_prompt", userEmail: "sasaki-ta@instyle.group", model: null, costUsdCents: null, toolName: null, decision: null, errorText: null },
    { id: 900, occurredAt: new Date(base - 1000 * 14), eventName: "api_request", userEmail: "sasaki-ta@instyle.group", model: "claude-sonnet-4-6", costUsdCents: 18, toolName: null, decision: null, errorText: null },
    { id: 899, occurredAt: new Date(base - 1000 * 80), eventName: "tool_result", userEmail: "sasaki-ta@instyle.group", model: null, costUsdCents: null, toolName: "read_file", decision: null, errorText: null },
    { id: 898, occurredAt: new Date(base - 1000 * 240), eventName: "tool_decision", userEmail: "yamada@instyle.group", model: null, costUsdCents: null, toolName: "exec_shell", decision: "allow", errorText: null },
    { id: 897, occurredAt: new Date(base - 1000 * 380), eventName: "api_error", userEmail: "fujita@instyle.group", model: "claude-opus-4-7", costUsdCents: null, toolName: null, decision: null, errorText: "503 Service Unavailable" },
  ];
}
