# AGENTS.md — web-dgnl (ThiOnline)

Web thi online Next.js 14. Chi tiết nghiệp vụ xem `README.md`.

## Lệnh verify (PHẢI chạy trước khi coi xong)

```bash
npx tsc --noEmit          # typecheck — 0 lỗi
npm run test              # vitest — mọi test xanh
npm run lint              # eslint — 0 error
npm run build             # build production
```

## Quy tắc làm việc

- **Task nhỏ, verify sau mỗi phần.** Không refactor không liên quan. Lớn thì dừng ở code ổn định, không làm nửa vời.
- **Không commit** trừ khi người dùng yêu cầu.
- AI **chỉ** Gemini free tier (`GEMINI_MODEL`, mặc định `gemini-2.0-flash`). OCR phải **offline** (tesseract.js) — không đưa ảnh lên API.
- **Guardrail chi phí:** mọi chỗ gọi Gemini phải đi qua `geminiQueue` và đếm vào `documents.aiCalls`; UI + route phải cap số lượt theo tài liệu.
- Migrate: sửa `src/lib/db/schema.ts` rồi `npm run db:generate` (chạy với `DATABASE_URL` giả nếu chưa có thật) — KHÔNG sửa tay SQL trừ khi cần.
- Serverless an toàn: mỗi request chỉ làm MỘT bước ngắn (một lượt OCR / một lô 9.000 ký tự); tiếp tục bằng client lặp gọi hoặc `/api/cron`. Tài liệu đang xử lý phải có khóa `documents.lockedUntil`.

## Cấu hình môi trường

`.env` (không commit): `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `CRON_SECRET`. Mẫu: `.env.example`.

## Điểm nhạy cảm

- `src/lib/parse-exam.ts` — parser 3 loại câu + bảng đáp án; đã có 16 unit test, sửa là chạy `npm run test`.
- `src/lib/attempt.ts` / `snapshot.ts` — chấm điểm + snapshot; bài đã thi không được thay đổi bởi việc sửa đề.
- `mupdf` là native module ESM-only — import động `await import("mupdf")`, không `require()`; đã khai báo external trong `next.config.mjs`.
- `tesseract.js` nhận Buffer/Uint8Array ở Node dù type `ImageLike` chỉ ghi kiểu browser.