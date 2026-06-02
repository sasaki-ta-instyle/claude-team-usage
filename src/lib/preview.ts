// Preview / demo mode. When PREVIEW=1, middleware lets everything through
// without auth and queries return seeded mock data instead of hitting the DB.
// Used for showing the Liquid Glass UI on Vercel without provisioning Neon /
// Resend / Anthropic Admin keys. NEVER enable this on the ConoHa production
// host.

import type { MemberRow } from "./queries";

export const PREVIEW = process.env.PREVIEW === "1";

const MOCK_MEMBERS: MemberRow[] = [
  { email: "sasaki-ta@instyle.group", displayName: "佐々木 猛", seatType: "premium", isAdmin: true, sessions: 132, commits: 24, prs: 7, tokens: 6_240_000, costCents: 18_400 },
  { email: "yamada@instyle.group", displayName: "山田", seatType: "premium", isAdmin: false, sessions: 98, commits: 17, prs: 5, tokens: 4_120_000, costCents: 12_750 },
  { email: "nakano@instyle.group", displayName: "中野", seatType: "premium", isAdmin: false, sessions: 76, commits: 14, prs: 3, tokens: 3_580_000, costCents: 9_810 },
  { email: "fujita@instyle.group", displayName: "藤田", seatType: "standard", isAdmin: false, sessions: 41, commits: 6, prs: 2, tokens: 1_240_000, costCents: 5_320 },
  { email: "ohashi@instyle.group", displayName: "大橋", seatType: "standard", isAdmin: false, sessions: 33, commits: 5, prs: 1, tokens: 980_000, costCents: 4_140 },
  { email: "saito@instyle.group", displayName: "斉藤", seatType: "standard", isAdmin: false, sessions: 22, commits: 3, prs: 1, tokens: 540_000, costCents: 2_460 },
  { email: "matsumoto@instyle.group", displayName: "松本", seatType: "standard", isAdmin: false, sessions: 18, commits: 2, prs: 0, tokens: 420_000, costCents: 1_980 },
  { email: "hidaka@instyle.group", displayName: "日高", seatType: null, isAdmin: false, sessions: 12, commits: 1, prs: 0, tokens: 260_000, costCents: 1_140 },
  { email: "izumi@instyle.group", displayName: "泉", seatType: null, isAdmin: false, sessions: 7, commits: 0, prs: 0, tokens: 110_000, costCents: 480 },
];

export function mockMembers(): MemberRow[] {
  return MOCK_MEMBERS.map((m) => ({ ...m }));
}

export function mockMemberDailyTrend(email: string, days = 30) {
  const base = MOCK_MEMBERS.find((m) => m.email === email) ?? MOCK_MEMBERS[0];
  const out: Array<{
    date: string;
    tokensInput: number;
    tokensOutput: number;
    tokensCacheRead: number;
    tokensCacheCreation: number;
    sessions: number;
    commits: number;
    prs: number;
    estimatedCostCents: number;
  }> = [];
  const today = new Date(Date.UTC(2026, 5, 2));
  const dailyTokens = Math.round(base.tokens / 30);
  const dailyCost = Math.round(base.costCents / 30);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    // Deterministic but varied wave: index → 0.55 .. 1.45
    const wave = 1 + 0.45 * Math.sin((i / 30) * Math.PI * 2 + email.length);
    const tokens = Math.round(dailyTokens * wave);
    out.push({
      date: d.toISOString().slice(0, 10),
      tokensInput: Math.round(tokens * 0.42),
      tokensOutput: Math.round(tokens * 0.18),
      tokensCacheRead: Math.round(tokens * 0.32),
      tokensCacheCreation: Math.round(tokens * 0.08),
      sessions: Math.round((base.sessions / 30) * wave),
      commits: i % 4 === 0 ? Math.round((base.commits / 30) * wave * 4) : 0,
      prs: i % 7 === 0 ? Math.round((base.prs / 30) * wave * 7) : 0,
      estimatedCostCents: Math.round(dailyCost * wave),
    });
  }
  return out;
}

export function mockUser(email: string) {
  const m = MOCK_MEMBERS.find((x) => x.email === email);
  if (!m) return null;
  return {
    id: m.email,
    email: m.email,
    name: m.displayName,
    displayName: m.displayName,
    seatType: m.seatType,
    isAdmin: m.isAdmin,
    image: null,
    emailVerified: null,
  };
}

export function mockMessagesSummary() {
  return [
    { accountId: "instyle-prod", workspaceId: "default", apiKeyId: "ig-builder-runner", model: "claude-opus-4-7", tokensInput: 4_200_000, tokensOutput: 1_180_000, tokensCacheRead: 12_400_000, tokensCacheCreation: 980_000 },
    { accountId: "instyle-prod", workspaceId: "default", apiKeyId: "ig-schedule-ai", model: "claude-sonnet-4-6", tokensInput: 2_840_000, tokensOutput: 720_000, tokensCacheRead: 6_120_000, tokensCacheCreation: 410_000 },
    { accountId: "instyle-prod", workspaceId: "cpc-tools", apiKeyId: "internal-tools", model: "claude-haiku-4-5", tokensInput: 1_240_000, tokensOutput: 380_000, tokensCacheRead: 2_010_000, tokensCacheCreation: 180_000 },
  ];
}

export function mockSyncLog() {
  const now = new Date(Date.UTC(2026, 5, 2, 9, 0));
  return [
    { id: 8, ranAt: new Date(now.getTime() - 1000 * 60 * 60 * 0).toISOString(), source: "code", fromDate: "2026-05-26", toDate: "2026-06-02", rowsUpserted: 56, status: "ok", errorText: null, durationMs: 1820 },
    { id: 7, ranAt: new Date(now.getTime() - 1000 * 60 * 60 * 0).toISOString(), source: "messages", fromDate: "2026-05-26", toDate: "2026-06-02", rowsUpserted: 18, status: "ok", errorText: null, durationMs: 740 },
    { id: 6, ranAt: new Date(now.getTime() - 1000 * 60 * 60 * 0).toISOString(), source: "users", fromDate: null, toDate: null, rowsUpserted: 9, status: "ok", errorText: null, durationMs: 320 },
    { id: 5, ranAt: new Date(now.getTime() - 1000 * 60 * 60 * 6).toISOString(), source: "code", fromDate: "2026-05-26", toDate: "2026-06-02", rowsUpserted: 56, status: "ok", errorText: null, durationMs: 1640 },
    { id: 4, ranAt: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(), source: "code", fromDate: "2026-05-26", toDate: "2026-06-02", rowsUpserted: 56, status: "ok", errorText: null, durationMs: 1720 },
    { id: 3, ranAt: new Date(now.getTime() - 1000 * 60 * 60 * 18).toISOString(), source: "messages", fromDate: "2026-05-26", toDate: "2026-06-02", rowsUpserted: 0, status: "error", errorText: "Anthropic Admin API 503 Service Unavailable", durationMs: 5012 },
  ];
}
