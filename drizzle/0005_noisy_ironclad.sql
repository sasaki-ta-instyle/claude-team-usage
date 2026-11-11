ALTER TABLE "user" ADD COLUMN "in_roster" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "roster_role" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "roster_synced_at" timestamp with time zone;--> statement-breakpoint
-- 既存の seat 保有者（seed 済み）はロスター在籍とみなす。CSV 取り込みで正確な状態に上書きされる。
UPDATE "user" SET "in_roster" = true WHERE "seat_type" IS NOT NULL;
