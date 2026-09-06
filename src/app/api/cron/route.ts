import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { sweepAllExpiredAttempts } from "@/lib/attempt";
import { extractPendingDocument } from "@/lib/extract";

/**
 * Cron server-side — chạy mỗi 5 phút qua GitHub Actions scheduled workflow
 * (.github/workflows/cron-sweep.yml) gọi endpoint này; vercel.json chỉ giữ 1 cron
 * daily làm dự phòng (Hobby giới hạn tần suất cron).
 * Làm 2 việc không phụ thuộc tab client:
 *  1) Quét & tự chốt điểm các lượt thi ACTIVE đã quá hạn (học sinh bỏ trống/tắt máy).
 *  2) Tiếp tục extraction cho tài liệu đang PROCESSING nhưng không ai còn bấm (đóng tab).
 * Xác thực bằng CRON_SECRET (header Authorization: Bearer hoặc ?token=).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình" }, { status: 503 });
  const header = req.headers.get("authorization");
  const token = req.nextUrl.searchParams.get("token");
  const tokenOk = header === `Bearer ${secret}` || (token !== null && token === secret);
  if (!tokenOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let finalized = 0;
  let docsAdvanced = 0;
  let docsCompleted = 0;
  const errors: string[] = [];

  // 1) Chốt điểm các lượt thi hết hạn
  try {
    finalized = await sweepAllExpiredAttempts();
  } catch (e) {
    errors.push(`sweep: ${(e as Error).message}`);
  }

  // 2) Tiếp tục extraction cho tài liệu đang dở (không cần ai giữ tab).
  //    Cap 3 tài liệu/chạy: mỗi tài liệu = 1 lô = 1 gọi AI, phải nằm trong giới hạn
  //    thời gian của function (Vercel Hobby ~15s) và tránh vượt rate-limit free tier.
  try {
    const pending = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(inArray(documents.status, ["UPLOADED", "PROCESSING"]));
    for (const doc of pending.slice(0, 3)) {
      const r = await extractPendingDocument(doc.id);
      if (r.advanced) docsAdvanced += 1;
      if (r.completed) docsCompleted += 1;
      if (r.error) errors.push(`doc ${doc.id}: ${r.error}`);
    }
  } catch (e) {
    errors.push(`extract: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok: true, finalized, docsAdvanced, docsCompleted, errors });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
