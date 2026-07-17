ALTER TABLE "cowork_events" ADD COLUMN "service_name" text;
--> statement-breakpoint
UPDATE "cowork_events"
  SET "service_name" = "raw"->'resource'->>'service.name'
  WHERE "service_name" IS NULL AND "raw" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cowork_events_service_name_idx"
  ON "cowork_events" ("service_name", "occurred_at");
