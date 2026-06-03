import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── NextAuth (Auth.js v5 / drizzle adapter) standard tables ───
// Reference: https://authjs.dev/getting-started/adapters/drizzle

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // claude-team-usage extensions
  seatType: text("seat_type"), // 'premium' | 'standard' | null
  isAdmin: boolean("is_admin").notNull().default(false),
  displayName: text("display_name"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) })
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) })
);

// ─── Usage tables ───

export const codeUsageDaily = pgTable(
  "code_usage_daily",
  {
    date: date("date").notNull(),
    userEmail: text("user_email").notNull(),
    organizationId: text("organization_id"),
    subscriptionType: text("subscription_type"),
    sessions: integer("sessions").notNull().default(0),
    linesAdded: integer("lines_added").notNull().default(0),
    linesAccepted: integer("lines_accepted").notNull().default(0),
    suggestions: integer("suggestions").notNull().default(0),
    accepts: integer("accepts").notNull().default(0),
    commits: integer("commits").notNull().default(0),
    prs: integer("prs").notNull().default(0),
    tokensInput: integer("tokens_input").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
    tokensCacheCreation: integer("tokens_cache_creation").notNull().default(0),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    models: jsonb("models"),
    terminalType: text("terminal_type"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.date, t.userEmail] }) })
);

export const messagesUsageDaily = pgTable(
  "messages_usage_daily",
  {
    date: date("date").notNull(),
    accountId: text("account_id").notNull(),
    workspaceId: text("workspace_id").notNull().default(""),
    apiKeyId: text("api_key_id").notNull().default(""),
    model: text("model").notNull().default(""),
    serviceTier: text("service_tier"),
    tokensInput: integer("tokens_input").notNull().default(0),
    tokensOutput: integer("tokens_output").notNull().default(0),
    tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
    tokensCacheCreation: integer("tokens_cache_creation").notNull().default(0),
    requests: integer("requests").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.date, t.accountId, t.workspaceId, t.apiKeyId, t.model],
    }),
  })
);

// Cowork OpenTelemetry イベント（Cowork admin > Monitoring から push される
// OTLP/HTTP logs を受信して保存）。
export const coworkEvents = pgTable("cowork_events", {
  id: serial("id").primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  eventName: text("event_name").notNull(),
  userEmail: text("user_email"),
  sessionId: text("session_id"),
  organizationId: text("organization_id"),
  promptId: text("prompt_id"),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsdCents: integer("cost_usd_cents"),
  durationMs: integer("duration_ms"),
  toolName: text("tool_name"),
  decision: text("decision"),
  errorText: text("error_text"),
  statusCode: integer("status_code"),
  promptLength: integer("prompt_length"),
  raw: jsonb("raw"),
});

export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull(), // 'code' | 'messages' | 'users'
  fromDate: date("from_date"),
  toDate: date("to_date"),
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  status: text("status").notNull(), // 'ok' | 'error'
  errorText: text("error_text"),
  durationMs: integer("duration_ms"),
});

export type User = typeof users.$inferSelect;
export type CodeUsageDaily = typeof codeUsageDaily.$inferSelect;
export type MessagesUsageDaily = typeof messagesUsageDaily.$inferSelect;
export type SyncLog = typeof syncLog.$inferSelect;
