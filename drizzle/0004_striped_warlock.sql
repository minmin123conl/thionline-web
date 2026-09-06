ALTER TABLE "documents" ADD COLUMN "parsed_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "parsed_done" boolean DEFAULT false NOT NULL;