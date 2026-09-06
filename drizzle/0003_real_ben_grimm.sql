ALTER TABLE "documents" ADD COLUMN "file_data" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "engine" text DEFAULT 'OFFLINE' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "total_pages" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ocr_pages_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_calls" integer DEFAULT 0 NOT NULL;