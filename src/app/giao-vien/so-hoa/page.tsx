import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, extractedItems } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { isAIConfigured } from "@/lib/ai";
import { NavBar } from "@/components/NavBar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { UploadDocumentForm } from "@/components/UploadDocumentForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Số hóa đề — ThiOnline" };

const STATUS: Record<string, { label: string; color: "slate" | "green" | "amber" | "red" | "blue" }> = {
  UPLOADED: { label: "Chưa đọc", color: "slate" },
  PROCESSING: { label: "Đang đọc dở", color: "blue" },
  NEEDS_REVIEW: { label: "Chờ duyệt", color: "amber" },
  IMPORTED: { label: "Đã tạo đề nháp", color: "green" },
  FAILED: { label: "Không đọc được", color: "red" },
};

export default async function DigitizeList() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role === "STUDENT") redirect("/hoc-sinh");

  const docs =
    user.role === "ADMIN"
      ? await db
          .select({
            id: documents.id,
            fileName: documents.fileName,
            fileType: documents.fileType,
            status: documents.status,
            error: documents.error,
            createdAt: documents.createdAt,
          })
          .from(documents)
          .orderBy(desc(documents.createdAt))
      : await db
          .select({
            id: documents.id,
            fileName: documents.fileName,
            fileType: documents.fileType,
            status: documents.status,
            error: documents.error,
            createdAt: documents.createdAt,
          })
          .from(documents)
          .where(eq(documents.teacherId, user.id))
          .orderBy(desc(documents.createdAt));

  const counts = await db
    .select({ docId: extractedItems.documentId, status: extractedItems.status, n: count() })
    .from(extractedItems)
    .groupBy(extractedItems.documentId, extractedItems.status);

  const total = new Map<string, number>();
  const approved = new Map<string, number>();
  for (const c of counts) {
    total.set(c.docId, (total.get(c.docId) ?? 0) + c.n);
    if (c.status === "APPROVED" || c.status === "EDITED") approved.set(c.docId, (approved.get(c.docId) ?? 0) + c.n);
  }

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Số hóa đề thi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tải đề dạng Word/PDF lên, AI đọc thành từng câu hỏi. Bạn kiểm tra và sửa lại trước khi tạo đề — AI có thể đọc
          sai công thức hoặc đáp án, nên bước duyệt là bắt buộc.
        </p>

        <Card className="mt-4 p-4">
          <UploadDocumentForm aiConfigured={isAIConfigured()} />
        </Card>

        <div className="mt-6 space-y-3">
          {docs.length === 0 ? (
            <EmptyState title="Chưa có tài liệu nào" subtitle="File tải lên sẽ xuất hiện ở đây kèm trạng thái đọc và số câu đã duyệt." />
          ) : (
            docs.map((d) => {
              const st = STATUS[d.status] ?? { label: d.status, color: "slate" as const };
              return (
                <Link key={d.id} href={`/giao-vien/so-hoa/${d.id}`}>
                  <Card className="p-4 transition-shadow hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{d.fileName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {d.fileType === "docx" ? "Word (.docx)" : d.fileType === "pdf_text" ? "PDF có lớp chữ" : "PDF scan"} ·{" "}
                          {total.get(d.id) ?? 0} câu đọc được · {approved.get(d.id) ?? 0} đã duyệt ·{" "}
                          {d.createdAt.toLocaleDateString("vi-VN")}
                        </p>
                        {d.error && <p className="mt-1 text-xs text-rose-600">{d.error}</p>}
                      </div>
                      <Badge color={st.color}>{st.label}</Badge>
                    </div>
                  </Card>
                </Link>
              );
            })
          )}
        </div>
      </main>
    </>
  );
}
