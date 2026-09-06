CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"class_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"attempts_allowed" integer DEFAULT 1 NOT NULL,
	"reveal_result" text DEFAULT 'IMMEDIATE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"client_seq" integer DEFAULT 0 NOT NULL,
	"answer" jsonb,
	"time_spent_ms" integer DEFAULT 0 NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"section_id" text NOT NULL,
	"position" integer NOT NULL,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text,
	"exam_id" text NOT NULL,
	"student_id" text NOT NULL,
	"mode" text DEFAULT 'EXAM' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"shuffle_seed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"practice_section_id" text,
	"score" real,
	"max_score" real,
	"section_scores" jsonb,
	"timing_mode" text DEFAULT 'PER_SECTION' NOT NULL,
	"global_deadline_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "class_members" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"join_code" text NOT NULL,
	"teacher_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classrooms_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"extracted_text" text DEFAULT '' NOT NULL,
	"extracted_html" text,
	"extract_cursor" integer DEFAULT 0 NOT NULL,
	"ai_configured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"org" text NOT NULL,
	"year" integer NOT NULL,
	"timing_mode" text NOT NULL,
	"total_minutes" integer NOT NULL,
	"total_score" integer NOT NULL,
	"sections_spec" jsonb NOT NULL,
	"choice_rules" jsonb,
	"brand_color" text DEFAULT '#0f172a' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "exam_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"teacher_id" text,
	"template_code" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"total_minutes" integer,
	"shuffle_questions" boolean DEFAULT true NOT NULL,
	"shuffle_options" boolean DEFAULT true NOT NULL,
	"attempts_allowed" integer DEFAULT 1 NOT NULL,
	"reveal_result" text DEFAULT 'IMMEDIATE' NOT NULL,
	"document_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extracted_items" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text DEFAULT 'QUESTION' NOT NULL,
	"payload" jsonb NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"source_page" integer,
	"status" text DEFAULT 'PENDING' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"section_id" text NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" jsonb,
	"explanation" text DEFAULT '' NOT NULL,
	"points" real DEFAULT 1 NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"confidence" real,
	"source_page" integer,
	"source_bbox" jsonb
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'STUDENT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classrooms_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_sections" ADD CONSTRAINT "attempt_sections_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_classrooms_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_template_code_exam_templates_code_fk" FOREIGN KEY ("template_code") REFERENCES "public"."exam_templates"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_items" ADD CONSTRAINT "extracted_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_class_idx" ON "assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "assignments_exam_idx" ON "assignments" USING btree ("exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_answer_uq" ON "attempt_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_section_uq" ON "attempt_sections" USING btree ("attempt_id","section_id");--> statement-breakpoint
CREATE INDEX "attempts_student_idx" ON "attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "attempts_exam_idx" ON "attempts" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "attempts_status_idx" ON "attempts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "class_member_uq" ON "class_members" USING btree ("class_id","user_id");--> statement-breakpoint
CREATE INDEX "documents_teacher_idx" ON "documents" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "exams_teacher_idx" ON "exams" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "exams_template_idx" ON "exams" USING btree ("template_code");--> statement-breakpoint
CREATE INDEX "extracted_items_doc_idx" ON "extracted_items" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "questions_exam_idx" ON "questions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "questions_section_idx" ON "questions" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "sections_exam_idx" ON "sections" USING btree ("exam_id");