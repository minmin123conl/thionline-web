import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Đặt lại mật khẩu — ThiOnline" };

/**
 * Trang đặt lại mật khẩu — user đến từ link trong email (Neon Auth gửi kèm
 * ?token=xxx). Token chỉ dùng MỘT lần và hết hạn (Neon Auth quản lý).
 */
export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ token?: string; error?: string }> | { token?: string; error?: string };
}) {
  const user = await getSessionUser();
  if (user) redirect("/");

  // Next 14: searchParams là object; Next 15: Promise — handle cả hai
  const sp = typeof props.searchParams === "object" && "then" in props.searchParams
    ? await props.searchParams
    : (props.searchParams as { token?: string; error?: string });
  const token = sp.token;
  // Neon Auth redirect về đây kèm ?error=INVALID_TOKEN khi link hết hạn/đã dùng
  const tokenError = sp.error ? "Link đặt lại mật khẩu đã hết hạn hoặc đã được sử dụng. Vui lòng yêu cầu link mới." : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="grid-paper absolute inset-0" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-fit">
            <Logo size={56} />
          </div>
          <h1 className="font-display text-[length:var(--step-3)] font-extrabold text-ink">Đặt lại mật khẩu</h1>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-contact)]">
          {tokenError ? (
            <div className="text-center">
              <p className="rounded-lg bg-rose-50 px-3 py-3 text-sm text-err">{tokenError}</p>
              <a href="/quen-mat-khau" className="btn btn-primary mt-5 inline-block">
                Yêu cầu link mới
              </a>
            </div>
          ) : token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="text-center">
              <p className="text-sm text-ink2">
                Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu link mới.
              </p>
              <a href="/quen-mat-khau" className="btn btn-primary mt-4 inline-block">
                Yêu cầu link mới
              </a>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-ink3">Link chỉ dùng được một lần và hết hạn sau 1 giờ.</p>
      </div>
    </div>
  );
}
