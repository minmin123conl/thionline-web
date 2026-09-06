import { redirect } from "next/navigation";
import { requireUser, getSessionUser } from "@/lib/auth";
import { getAttempt } from "@/lib/attempt";
import { ExamPlayer } from "@/components/ExamPlayer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Làm bài — ThiOnline" };

export default async function ExamPage({ params }: { params: { attemptId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  const attempt = await getAttempt(params.attemptId);
  if (!attempt || attempt.studentId !== user.id) redirect("/hoc-sinh");
  if (attempt.status !== "ACTIVE") redirect(`/ket-qua/${params.attemptId}`);
  void requireUser;
  return <ExamPlayer attemptId={params.attemptId} />;
}
