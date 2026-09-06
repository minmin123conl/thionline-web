import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, extractedItems } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { isAIConfigured } from "@/lib/ai";
import { NavBar } from "@/components/NavBar";
import { ReviewScreen } from "@/components/ReviewScreen";
import type { ExtractedItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Duyệt đề số hóa — ThiOnline" };

const MAX_SOURCE_CHARS = 200_000;

export default async function DigitizeReview({ params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/dang-nhap");
  }
  if (user.role === "STUDENT") redirect("/hoc-sinh");

  const rows = await db.select().from(documents).where(eq(documents.id, params.id));
  const doc = rows[0];
  if (!doc || (user.role !== "ADMIN" && doc.teacherId !== user.id)) notFound();

  const itemRows = await db.select().from(extractedItems).where(eq(extractedItems.documentId, doc.id));
  itemRows.sort((a, b) => a.seq - b.seq);
  const items: ExtractedItem[] = itemRows.map((i) => ({
    id: i.id,
    seq: i.seq,
    status: i.status as ExtractedItem["status"],
    confidence: i.confidence,
    payload: i.payload as ExtractedItem["payload"],
  }));

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <Link href="/giao-vien/so-hoa" className="text-sm text-slate-500 hover:text-slate-800">
          ← Danh sách tài liệu
        </Link>
        <div className="mt-3">
          <ReviewScreen
            doc={{
              id: doc.id,
              fileName: doc.fileName,
              fileType: doc.fileType,
              status: doc.status,
              error: doc.error,
              extractCursor: doc.extractCursor,
              extractedText: doc.extractedText.slice(0, MAX_SOURCE_CHARS),
              engine: doc.engine,
              totalPages: doc.totalPages,
              ocrPagesDone: doc.ocrPagesDone,
              aiCalls: doc.aiCalls,
              parsedDone: doc.parsedDone,
              parsedText: doc.parsedText.slice(0, MAX_SOURCE_CHARS),
            }}
            initialItems={items}
            aiConfigured={isAIConfigured()}
          />
        </div>
      </main>
    </>
  );
}
