import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Quên mật khẩu — ThiOnline" };

export default async function ForgotPasswordPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="grid-paper absolute inset-0" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-fit">
            <Logo size={56} />
          </div>
          <h1 className="font-display text-[length:var(--step-3)] font-extrabold text-ink">Quên mật khẩu?</h1>
          <p className="mt-2 text-sm text-ink2">Nhập email đăng nhập — chúng tôi gửi link đặt lại mật khẩu.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-contact)]">
          <ForgotPasswordForm />
        </div>
        <p className="mt-6 text-center text-xs text-ink3">Kiểm tra cả thư mục spam nếu không thấy email trong vài phút.</p>
      </div>
    </div>
  );
}
