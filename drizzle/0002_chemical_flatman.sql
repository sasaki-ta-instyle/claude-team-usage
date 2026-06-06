CREATE TABLE "cost_report_daily" (
	"date" date NOT NULL,
	"workspace_id" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"cost_type" text DEFAULT '' NOT NULL,
	"token_type" text DEFAULT '' NOT NULL,
	"context_window" text DEFAULT '' NOT NULL,
	"service_tier" text DEFAULT '' NOT NULL,
	"inference_geo" text DEFAULT '' NOT NULL,
	"amount_cents" numeric DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_report_daily_date_workspace_id_model_cost_type_token_type_context_window_service_tier_inference_geo_pk" PRIMARY KEY("date","workspace_id","model","cost_type","token_type","context_window","service_tier","inference_geo")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"display_color" text,
	"archived_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
