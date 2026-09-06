import {
  pgTable,
  text,
  integer,
  boolean,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const id = () => crypto.randomUUID();

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("STUDENT"), // ADMIN | TEACHER | STUDENT
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const classRooms = pgTable("classrooms", {
  id: text("id").primaryKey().$defaultFn(id),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  teacherId: text("teacher_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const classMembers = pgTable(
  "class_members",
  {
    id: text("id").primaryKey().$defaultFn(id),
    classId: text("class_id").notNull().references(() => classRooms.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("class_member_uq").on(t.classId, t.userId)]
);

// Khuôn kỳ thi thực chiến (HSA/TSA/V-ACT...): thêm kỳ thi mới = thêm dữ liệu, không sửa code
export const examTemplates = pgTable("exam_templates", {
  id: text("id").primaryKey().$defaultFn(id),
  code: text("code").notNull().unique(), // hsa | tsa | vact
  name: text("name").notNull(),
  org: text("org").notNull(),
  year: integer("year").notNull(),
  timingMode: text("timing_mode").notNull(), // PER_SECTION | GLOBAL
  totalMinutes: integer("total_minutes").notNull(),
  totalScore: integer("total_score").notNull(),
  sectionsSpec: jsonb("sections_spec").notNull(), // TemplateSectionSpec[]
  choiceRules: jsonb("choice_rules"), // quy tắc phần tự chọn (HSA phần 3)
  brandColor: text("brand_color").notNull().default("#0f172a"),
  description: text("description").notNull().default(""),
});

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey().$defaultFn(id),
    teacherId: text("teacher_id").notNull().references(() => users.id),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(), // docx | pdf_text | pdf_scan
    status: text("status").notNull().default("UPLOADED"), // UPLOADED | PROCESSING | NEEDS_REVIEW | IMPORTED | FAILED
    error: text("error").notNull().default(""),
    extractedText: text("extracted_text").notNull().default(""),
    extractedHtml: text("extracted_html"), // docx → html để xem bản gốc đẹp hơn
    extractCursor: integer("extract_cursor").notNull().default(0), // trích xuất theo lô (giới hạn thời gian hàm serverless)
    aiConfigured: boolean("ai_configured").notNull().default(false),
    lockedUntil: timestamp("locked_until", { withTimezone: true }), // chống 2 caller (client + cron) xử lý cùng tài liệu
    // File gốc (base64) để OCR/đọc lại; tối đa 4MB nên lưu thẳng DB, không cần object storage
    fileData: text("file_data"),
    // Text tích lũy từ OCR từng trang (PDF scan) — engine OFFLINE parse từ đây.
    // docx/PDF có lớp chữ: dùng extractedText, không cần OCR.
    parsedText: text("parsed_text").notNull().default(""),
    // Engine OFFLINE: đã parse xong văn bản → true (idempotent, không parse lại)
    parsedDone: boolean("parsed_done").notNull().default(false),
    // Engine đọc: OFFLINE (parser thuần + OCR tesseract, không tốn API) | AI (Gemini)
    engine: text("engine").notNull().default("OFFLINE"),
    totalPages: integer("total_pages").notNull().default(0), // PDF scan: tổng trang
    ocrPagesDone: integer("ocr_pages_done").notNull().default(0), // PDF scan: trang đã OCR
    aiCalls: integer("ai_calls").notNull().default(0), // tổng số lượt gọi Gemini
    aiExtractionCalls: integer("ai_extraction_calls").notNull().default(0),
    aiAnswerCalls: integer("ai_answer_calls").notNull().default(0),
    aiExplanationCalls: integer("ai_explanation_calls").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_teacher_idx").on(t.teacherId)]
);

export const extractedItems = pgTable(
  "extracted_items",
  {
    id: text("id").primaryKey().$defaultFn(id),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull().default("QUESTION"),
    payload: jsonb("payload").notNull(), // ExtractedQuestion
    confidence: real("confidence").notNull().default(0),
    sourcePage: integer("source_page"),
    status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | EDITED | REJECTED
  },
  (t) => [index("extracted_items_doc_idx").on(t.documentId)]
);

export const exams = pgTable(
  "exams",
  {
    id: text("id").primaryKey().$defaultFn(id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    teacherId: text("teacher_id").references(() => users.id), // null = đề hệ thống/admin
    templateCode: text("template_code").references(() => examTemplates.code), // đề mock gắn khuôn
    status: text("status").notNull().default("DRAFT"), // DRAFT | PUBLISHED
    totalMinutes: integer("total_minutes"), // đề giáo viên không theo khuôn
    shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
    shuffleOptions: boolean("shuffle_options").notNull().default(true),
    attemptsAllowed: integer("attempts_allowed").notNull().default(1),
    revealResult: text("reveal_result").notNull().default("IMMEDIATE"), // IMMEDIATE | AFTER_CLOSE | MANUAL
    documentId: text("document_id").references(() => documents.id),
    aiExplanationCalls: integer("ai_explanation_calls").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [index("exams_teacher_idx").on(t.teacherId), index("exams_template_idx").on(t.templateCode)]
);

export const sections = pgTable(
  "sections",
  {
    id: text("id").primaryKey().$defaultFn(id),
    examId: text("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    code: text("code").notNull().default(""),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    minutes: integer("minutes").notNull(), // PER_SECTION: hạn thật; GLOBAL: khuyến nghị
  },
  (t) => [index("sections_exam_idx").on(t.examId)]
);

export const questions = pgTable(
  "questions",
  {
    id: text("id").primaryKey().$defaultFn(id),
    examId: text("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    sectionId: text("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type").notNull(), // MC4 | FILL | TRUE_FALSE
    stem: text("stem").notNull(), // hỗ trợ LaTeX $...$
    options: jsonb("options").notNull().default([]), // [{id:"A",text}]
    answer: jsonb("answer"), // MC4:"B" | FILL:[...] | TRUE_FALSE:[b x4]
    explanation: text("explanation").notNull().default(""),
    points: real("points").notNull().default(1),
    isTrial: boolean("is_trial").notNull().default(false), // câu thử nghiệm không tính điểm
    confidence: real("confidence"),
    sourcePage: integer("source_page"),
    sourceBBox: jsonb("source_bbox"),
  },
  (t) => [index("questions_exam_idx").on(t.examId), index("questions_section_idx").on(t.sectionId)]
);

export const assignments = pgTable(
  "assignments",
  {
    id: text("id").primaryKey().$defaultFn(id),
    examId: text("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    classId: text("class_id").notNull().references(() => classRooms.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id").notNull().references(() => users.id),
    title: text("title").notNull().default(""),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    attemptsAllowed: integer("attempts_allowed").notNull().default(1),
    revealResult: text("reveal_result").notNull().default("IMMEDIATE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assignments_class_idx").on(t.classId), index("assignments_exam_idx").on(t.examId)]
);

export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey().$defaultFn(id),
    assignmentId: text("assignment_id").references(() => assignments.id, { onDelete: "cascade" }),
    examId: text("exam_id").notNull().references(() => exams.id),
    studentId: text("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("EXAM"), // EXAM | MOCK_FULL | PRACTICE
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUBMITTED | AUTO_SUBMITTED
    shuffleSeed: integer("shuffle_seed").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    practiceSectionId: text("practice_section_id"),
    score: real("score"),
    maxScore: real("max_score"),
    sectionScores: jsonb("section_scores"), // {sectionId:{score,max,title}}
    timingMode: text("timing_mode").notNull().default("PER_SECTION"),
    globalDeadlineAt: timestamp("global_deadline_at", { withTimezone: true }),
    // Bản "đóng băng" nội dung đề tại thời điểm học sinh bắt đầu: kể cả khi giáo viên
    // sửa đề sau đó, lượt thi này vẫn thấy & chấm đúng nội dung đã nhận.
    contentSnapshot: jsonb("content_snapshot"),
  },
  (t) => [
    index("attempts_student_idx").on(t.studentId),
    index("attempts_exam_idx").on(t.examId),
    index("attempts_status_idx").on(t.status),
    // Chống 2 lượt ACTIVE cùng lúc cho một (đề giao, học sinh) — race khi học sinh
    // bấm "vào phòng thi" 2 lần song song. Vi phạm unique -> route resume lượt cũ.
    uniqueIndex("attempt_active_uq").on(t.assignmentId, t.studentId).where(sql`${t.status} = 'ACTIVE'`),
  ]
);

export const attemptSections = pgTable(
  "attempt_sections",
  {
    id: text("id").primaryKey().$defaultFn(id),
    attemptId: text("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    sectionId: text("section_id").notNull(),
    position: integer("position").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }), // nguồn chân lý server-side
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("attempt_section_uq").on(t.attemptId, t.sectionId)]
);

export const attemptAnswers = pgTable(
  "attempt_answers",
  {
    id: text("id").primaryKey().$defaultFn(id),
    attemptId: text("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    clientSeq: integer("client_seq").notNull().default(0),
    answer: jsonb("answer"),
    timeSpentMs: integer("time_spent_ms").notNull().default(0),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attempt_answer_uq").on(t.attemptId, t.questionId)]
);

// Rate limit server-side dùng DB (sliding window) — serverless không có state chia sẻ
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(), // vd "ai:userId" hoặc "login:ip"
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
    count: integer("count").notNull().default(0),
  }
);

export type User = typeof users.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type ExamTemplate = typeof examTemplates.$inferSelect;
