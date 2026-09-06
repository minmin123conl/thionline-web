# ThiOnline — Nền tảng thi trực tuyến

Web thi online cho dạng đề **Đánh giá năng lực / Đánh giá tư duy** (HSA, TSA...): giáo viên số hóa đề từ file, học sinh làm bài theo phòng thi, hệ thống chấm và báo cáo.

Stack: **Next.js 14 (App Router) · TypeScript · Tailwind · Drizzle ORM · Neon Postgres · JWT (jose) · KaTeX**. AI (tùy chọn): **Gemini free tier** để trích xuất đề & sinh đáp án. OCR **offline** (mupdf render + tesseract.js) để đọc PDF dạng ảnh mà không tốn API.

## Cài đặt

```bash
npm install
cp .env.example .env   # điền DATABASE_URL, AUTH_SECRET, ADMIN_*, GEMINI_API_KEY
npm run db:setup       # generate migration + migrate + seed (user admin + mẫu đề HSA/TSA)
npm run dev
```

Mở http://localhost:3000 — đăng nhập bằng tài khoản admin do seed tạo (xem `scripts/seed.mjs`).

## Chạy thử / kiểm tra

```bash
npm run lint       # ESLint
npm run test       # Vitest (parser đề, snapshot bài thi, cron isExpired, gen-answers)
npx tsc --noEmit   # typecheck
npm run build      # build production
```

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `DATABASE_URL` | Có | Chuỗi kết nối Neon Postgres (`?sslmode=require`) |
| `AUTH_SECRET` | Có | Secret ký JWT (cookie session) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Có | Tạo user admin khi seed |
| `GEMINI_API_KEY` | Không | Bật engine **AI** (trích xuất đề, sinh đáp án, giải thích). Không có → vẫn dùng được engine **offline** |
| `GEMINI_MODEL` | Không | Mặc định `gemini-2.0-flash` |
| `CRON_SECRET` | Có cho production | Token riêng bảo vệ cron `/api/cron` |

## Số hóa đề (tải file → câu hỏi)

Giáo viên tải **docx** hoặc **pdf** (có lớp chữ hoặc dạng ảnh/scan) vào trang số hóa. Hệ thống tách thành 3 loại câu: **MC4** (A–D), **Đúng/Sai** (4 ý), **Điền khuyết**. Hai engine đọc:

- **Tự động (offline)** — mặc định, **miễn phí**: parser thuần tiếng Việt + OCR tesseract (vietnamese+english) chạy ngay trên server. PDF scan được OCR **từng trang** theo mỗi lần bấm (an toàn cho serverless), text gom dần rồi parse một lần.
- **AI (Gemini)** — tốn lượt gọi API: cắt văn bản theo lô gửi Gemini. Giới hạn `aiCalls` theo tài liệu để **chống phát sinh chi phí**.

Đáp án khớp từ bảng đáp án trong file (nếu có); câu thiếu đáp án → giáo viên nhập tay ở màn duyệt, hoặc bấm **"Gen đáp án bằng AI"** (tùy chọn, bị cap số lượt theo tài liệu). Giáo viên duyệt từng câu (độ tin cậy, sửa, loại) rồi **tạo đề nháp** → chỉnh điểm/thứ tự/giải thích → phát hành → tạo lớp & gán bài tập.

> OCR là bước nặng: mỗi trang PDF scan ~ vài giây. Với file dài, bấm nhiều lần (có progress bar) hoặc để **cron** chạy ngầm đọc tiếp dần.

## Cron (đọc file nền)

`/api/cron` chạy hằng phút: quét các tài liệu đang `PROCESSING`/`UPLOADED`, mỗi lần tiến một bước nhỏ (idempotent, có khóa chống trùng). Trên Vercel: config đã có trong `vercel.json`; đặt `CRON_SECRET`. Local/dev:

```bash
curl -X POST http://localhost:3000/api/cron -H "Authorization: Bearer $CRON_SECRET"
```

## Triển khai Vercel

1. Push repo, tạo project Vercel (framework Next.js).
2. Thêm **environment variables** (bảng ở trên) vào project.
3. Chạy migration + seed **một lần** bằng cách trỏ `.env` local vào cùng DB: `npm run db:setup` (hoặc chạy `scripts/migrate.mjs` + `scripts/seed.mjs`).
4. Build tự động khi push. Cron hoạt động theo `vercel.json`.

> **Lưu ý:** `mupdf` là native module. Nếu build Vercel gặp lỗi native, kiểm tra bản node/region hỗ trợ; engine offline cần runtime Node (không edge).

## Cấu trúc chính

```
src/lib/
  parse-exam.ts   parser offline: nhận 3 loại câu + bảng đáp án tiếng Việt
  ocr.ts          mupdf render PDF → PNG, tesseract.js OCR (vie+eng)
  extract.ts      tiến trình đọc file theo bước (cho client + cron dùng chung)
  ai.ts           Gemini client (queue, retry 429) + prompt trích xuất/sinh đáp án
  snapshot.ts     snapshot đáp án tại thời điểm làm bài (chống sửa đề sau khi thi)
  attempt.ts      chấm điểm + sweep hết giờ (cron)
src/app/api/
  documents/...   upload, extract (bước đọc), gen-answers, import đề, items
  exams/...       đề, content, assignments, publish, explain
  attempts/...    start, answer, advance, submit, result
  cron/           chấm tự động + sweep hết giờ + đọc file nền
```

## Giấy phép / phụ thuộc

- `mupdf` bản phân phối AGPL — nếu phát hành sản phẩm thương mại, cân nhắc tách bộ OCR hoặc dùng bản giấy phép thương mại.
- OCR chạy in-server, không đưa dữ liệu lên dịch vụ thứ ba.
