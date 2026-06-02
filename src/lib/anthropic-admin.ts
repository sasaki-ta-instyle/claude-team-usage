// Anthropic Admin API client.
// Docs: https://platform.claude.com/docs/en/manage-claude/admin-api
//       https://platform.claude.com/docs/en/build-with-claude/claude-code-analytics-api

const BASE = "https://api.anthropic.com";

function authHeaders(): HeadersInit {
  const key = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!key) throw new Error("ANTHROPIC_ADMIN_API_KEY is not set");
  return {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Anthropic Admin API ${res.status} ${res.statusText} for ${path}: ${body.slice(0, 500)}`
    );
  }
  return (await res.json()) as T;
}

type PageEnvelope<T> = {
  data: T[];
  has_more?: boolean;
  next_page?: string | null;
  first_id?: string | null;
  last_id?: string | null;
};

async function* paginate<T>(initialPath: string): AsyncGenerator<T> {
  let path: string | null = initialPath;
  // Guard against runaway loops.
  for (let i = 0; i < 100 && path; i++) {
    const page: PageEnvelope<T> = await request<PageEnvelope<T>>(path);
    for (const row of page.data ?? []) yield row;
    if (!page.has_more) break;
    path = page.next_page ?? null;
  }
}

// ─── Endpoint shapes (subset of fields we care about) ───

export type CodeUsageRow = {
  date: string; // YYYY-MM-DD
  organization_id?: string;
  subscription_type?: "team" | "enterprise" | null;
  actor: {
    type: "user_actor" | "api_actor";
    email_address?: string;
    api_key_name?: string;
  };
  // Engagement
  num_sessions?: number;
  lines_of_code?: { added?: number; accepted?: number };
  suggestions?: { count?: number; accepted_count?: number };
  commits_by_claude_code?: number;
  pull_requests_by_claude_code?: number;
  // Tokens (model-agnostic totals)
  core_metrics?: {
    tokens?: {
      input?: number;
      output?: number;
      cache_read?: number;
      cache_creation?: number;
    };
    estimated_cost?: { amount?: number; currency?: string };
  };
  models_used?: Array<Record<string, unknown>>;
  terminal_type?: string;
};

export type MessagesUsageRow = {
  starting_at: string; // YYYY-MM-DD…
  ending_at?: string;
  results: Array<{
    account_id?: string;
    workspace_id?: string;
    api_key_id?: string;
    model?: string;
    service_tier?: string;
    uncached_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    output_tokens?: number;
    server_tool_use?: { web_search_requests?: number };
  }>;
};

export type OrganizationUser = {
  id: string;
  type: "user";
  email: string;
  name?: string;
  role?: string;
  added_at?: string;
  seat_type?: "claude_team_premium" | "claude_team_standard" | string | null;
};

// ─── Fetchers ───

export async function* fetchCodeUsage(startingAt: string) {
  // The endpoint accepts starting_at (inclusive). We fetch from startingAt
  // through today and let the caller filter by date if needed.
  const path = `/v1/organizations/usage_report/claude_code?starting_at=${startingAt}`;
  for await (const row of paginate<CodeUsageRow>(path)) {
    yield row;
  }
}

export async function* fetchMessagesUsage(startingAt: string) {
  const params = new URLSearchParams({
    starting_at: startingAt,
    bucket_width: "1d",
  });
  // Auth allows array-style group_by[] keys.
  ["account_id", "workspace_id", "api_key_id", "model"].forEach((g) =>
    params.append("group_by[]", g)
  );
  const path = `/v1/organizations/usage_report/messages?${params.toString()}`;
  for await (const row of paginate<MessagesUsageRow>(path)) {
    yield row;
  }
}

export async function* fetchUsers() {
  for await (const row of paginate<OrganizationUser>(
    "/v1/organizations/users?limit=100"
  )) {
    yield row;
  }
}
