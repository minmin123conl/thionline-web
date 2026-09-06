ALTER TABLE "documents" ADD COLUMN "ai_extraction_calls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_answer_calls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_explanation_calls" integer DEFAULT 0 NOT NULL;