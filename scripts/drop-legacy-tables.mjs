import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Thiếu DATABASE_URL. Chạy: node --env-file=.env scripts/drop-legacy-tables.mjs");
  process.exit(1);
}
const sql = neon(url);

// Chỉ định danh các bảng CỦA THIONLINE — bắt buộc không được xóa nhầm
const THIONLINE_TABLES = new Set([
  "users", "classrooms", "class_members", "exams", "sections", "questions",
  "exam_templates", "assignments", "attempts", "attempt_sections", "attempt_answers",
  "documents", "extracted_items", "rate_limits",
]);

// 1) Lấy danh sách bảng lạ: mọi bảng public KHÔNG thuộc ThiOnline
const all = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
const legacy = all.map((r) => r.table_name).filter((t) => !THIONLINE_TABLES.has(t));
if (legacy.length === 0) {
  console.log("Không có bảng lạ nào — DB đã sạch.");
  process.exit(0);
}
console.log("Bảng lạ sẽ xóa:", legacy.join(", "));

// 2) An toàn: mỗi bảng lạ phải KHÔNG được tham chiếu bởi bảng nào của ThiOnline
const thioFks = await sql`
  SELECT tc.table_name AS from_table, ccu.table_name AS to_table
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
`;
for (const fk of thioFks) {
  if (legacy.includes(fk.to_table) && THIONLINE_TABLES.has(fk.from_table)) {
    console.error(`DỪNG: bảng ThiOnline "${fk.from_table}" đang FK tới bảng lạ "${fk.to_table}" — không thể xóa!`);
    process.exit(1);
  }
}

// 3) Drop: CASCADE vì các bảng lạ FK chằng chịt với nhau
//    (chỉ ảnh hưởng object thuộc chuỗi bảng lạ — ThiOnline không tham chiếu chúng)
for (const t of legacy) {
  await sql.unsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`);
  console.log(`  Đã xóa: ${t}`);
}

// 4) Xác minh sau khi xóa
const after = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
console.log("\nBẢNG CÒN LẠI (" + after.length + "):", after.map((r) => r.table_name).join(", "));
const leaked = after.filter((r) => !THIONLINE_TABLES.has(r.table_name));
if (leaked.length > 0) console.log("CẢNH BÁO còn bảng lạ:", leaked.map((r) => r.table_name).join(", "));
else console.log("✓ DB giờ chỉ chứa bảng của ThiOnline — sạch hoàn toàn.");
