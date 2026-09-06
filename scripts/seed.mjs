import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Thiếu DATABASE_URL. Chạy: node --env-file=.env scripts/seed.mjs");
  process.exit(1);
}
const sql = neon(url);

const templates = [
  {
    code: "hsa",
    name: "Đánh giá năng lực — ĐHQG Hà Nội (HSA)",
    org: "Đại học Quốc gia Hà Nội",
    year: 2026,
    timing_mode: "PER_SECTION",
    total_minutes: 195,
    total_score: 150,
    brand_color: "#0b6e4f",
    description:
      "Bài thi 150 câu, 195 phút, 3 phần. Mỗi phần có đồng hồ riêng; hết giờ phần trước sẽ bị khóa và không thể quay lại — giống quy chế thi thật trên máy tính.",
    sections_spec: [
      { code: "MATH", title: "Phần 1 — Toán học và Xử lý số liệu", minutes: 75, questions: 50, score: 50, trials: 1, types: { MC4: 35, FILL: 15 } },
      { code: "LANG", title: "Phần 2 — Văn học và Ngôn ngữ", minutes: 60, questions: 50, score: 50, trials: 1, types: { MC4: 50 }, passages: { groups: 5, questionsPerGroup: 5, standalone: 25 } },
      { code: "ELECTIVE", title: "Phần 3 — Khoa học tự chọn hoặc Tiếng Anh", minutes: 60, questions: 50, score: 50, trials: 1, types: { MC4: 40, FILL: 10 } },
    ],
    choice_rules: {
      sectionCode: "ELECTIVE",
      mode: "SELECT_ONE_BRANCH",
      branches: [
        { id: "science", label: "Khoa học (chọn 3/5 chủ đề)", pickCount: 3, subjects: ["Vật lý", "Hóa học", "Sinh học", "Lịch sử", "Địa lý"] },
        { id: "english", label: "Tiếng Anh", subjects: ["Tiếng Anh"] },
      ],
    },
  },
  {
    code: "tsa",
    name: "Đánh giá tư duy — ĐH Bách khoa Hà Nội (TSA)",
    org: "Đại học Bách khoa Hà Nội",
    year: 2026,
    timing_mode: "PER_SECTION",
    total_minutes: 150,
    total_score: 100,
    brand_color: "#c8102e",
    description:
      "Bài thi 100 câu, 150 phút, 3 phần với 3 dạng câu: trắc nghiệm 4 lựa chọn, đúng/sai 4 ý (chấm điểm từng ý), điền đáp án. Mỗi phần có đồng hồ riêng và khóa khi hết giờ.",
    sections_spec: [
      { code: "MATH", title: "Phần 1 — Tư duy Toán học", minutes: 60, questions: 25, score: 40, types: { MC4: 15, TRUE_FALSE: 5, FILL: 5 } },
      { code: "READING", title: "Phần 2 — Tư duy Đọc hiểu", minutes: 30, questions: 20, score: 20, types: { MC4: 20 } },
      { code: "SCIENCE", title: "Phần 3 — Tư duy Khoa học và Giải quyết vấn đề", minutes: 60, questions: 55, score: 40, types: { MC4: 35, TRUE_FALSE: 10, FILL: 10 } },
    ],
    choice_rules: null,
  },
  {
    code: "vact",
    name: "Đánh giá năng lực — ĐHQG TP.HCM (V-ACT)",
    org: "Đại học Quốc gia TP. Hồ Chí Minh",
    year: 2026,
    timing_mode: "GLOBAL",
    total_minutes: 150,
    total_score: 1200,
    brand_color: "#005baa",
    description:
      "Bài thi 120 câu, 150 phút dùng chung MỘT đồng hồ (như thi giấy thật): bạn tự phân bổ thời gian và được tự do di chuyển giữa 4 phần. Điểm tối đa 1200 — điểm quy đổi trên hệ thống là ước lượng tham khảo (thang chính thức chấm theo IRT).",
    sections_spec: [
      { code: "LANGUAGE", title: "Phần 1 — Sử dụng ngôn ngữ", minutes: 45, questions: 60, score: 60, types: { MC4: 60 }, note: "30 câu tiếng Việt + 30 câu tiếng Anh. Thời gian từng phần là mức khuyến nghị." },
      { code: "MATH", title: "Phần 2 — Toán học", minutes: 35, questions: 22, score: 22, types: { MC4: 22 }, note: "Thời gian khuyến nghị." },
      { code: "SCIENCE", title: "Phần 3 — Tư duy khoa học", minutes: 35, questions: 18, score: 18, types: { MC4: 18 }, note: "Thời gian khuyến nghị." },
      { code: "LOGIC", title: "Phần 4 — Tư duy logic và Phân tích số liệu", minutes: 35, questions: 20, score: 20, types: { MC4: 20 }, note: "Thời gian khuyến nghị." },
    ],
    choice_rules: null,
  },
];

for (const t of templates) {
  await sql`
    INSERT INTO exam_templates (id, code, name, org, year, timing_mode, total_minutes, total_score, brand_color, description, sections_spec, choice_rules)
    VALUES (${crypto.randomUUID()}, ${t.code}, ${t.name}, ${t.org}, ${t.year}, ${t.timing_mode}, ${t.total_minutes}, ${t.total_score}, ${t.brand_color}, ${t.description}, ${JSON.stringify(t.sections_spec)}::jsonb, ${t.choice_rules ? JSON.stringify(t.choice_rules) : null}::jsonb)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name, org = EXCLUDED.org, year = EXCLUDED.year, timing_mode = EXCLUDED.timing_mode,
      total_minutes = EXCLUDED.total_minutes, total_score = EXCLUDED.total_score, brand_color = EXCLUDED.brand_color,
      description = EXCLUDED.description, sections_spec = EXCLUDED.sections_spec, choice_rules = EXCLUDED.choice_rules`;
}
console.log("Seeded templates: hsa, tsa, vact");

const adminEmail = (process.env.ADMIN_EMAIL || "admin@localhost").toLowerCase();
const existing = await sql`SELECT id FROM users WHERE email = ${adminEmail}`;
if (existing.length === 0) {
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString("base64url");
    generated = true;
  }
  const hash = await bcrypt.hash(password, 10);
  await sql`
    INSERT INTO users (id, email, password_hash, name, role)
    VALUES (${crypto.randomUUID()}, ${adminEmail}, ${hash}, ${"Quản trị hệ thống"}, ${"ADMIN"})`;
  if (generated) {
    console.log("=".repeat(64));
    console.log(`Đã tạo tài khoản quản trị: ${adminEmail}`);
    console.log(`Mật khẩu ngẫu nhiên (chỉ hiện MỘT LẦN tại đây, không bao giờ hiện trên web):`);
    console.log(password);
    console.log("=".repeat(64));
  } else {
    console.log(`Đã tạo tài khoản quản trị từ biến môi trường: ${adminEmail}`);
  }
} else {
  console.log(`Tài khoản quản trị đã tồn tại: ${adminEmail}`);
}
