import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "01", title: "Tải đề lên", desc: "Chọn file .docx hoặc PDF — kể cả bản scan. Hệ thống tự nhận diện câu trắc nghiệm, điền khuyết, đúng/sai." },
  { n: "02", title: "Duyệt & sinh đáp án", desc: "AI Gemini đề xuất đáp án và lời giải cho từng câu. Giáo viên soát lại, sửa một lần rồi phát hành." },
  { n: "03", title: "Giao & thi", desc: "Giao đề cho cả lớp theo lịch. Mỗi học sinh nhận đề đã đảo thứ tự; hết giờ phần nào khóa phần đó." },
  { n: "04", title: "Chấm & báo cáo", desc: "Điểm tự động ngay khi nộp. Báo cáo cho biết câu nào cả lớp sai nhiều nhất để ôn lại." },
];

export default async function Home() {
  const user = await getSessionUser();
  const homeByRole: Record<string, string> = { ADMIN: "/admin", TEACHER: "/giao-vien", STUDENT: "/hoc-sinh" };

  if (user && homeByRole[user.role]) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
        <p className="text-sm text-ink2">
          Bạn đang đăng nhập với vai trò {user.role === "ADMIN" ? "quản trị viên" : user.role === "TEACHER" ? "giáo viên" : "học sinh"}.
        </p>
        <div className="flex gap-3">
          <Link href={homeByRole[user.role]} className="btn btn-primary">
            Vào khu làm việc →
          </Link>
          <Link href="/api/auth/logout" className="btn btn-secondary">
            Đăng xuất
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blu text-lg font-extrabold text-white">T</span>
          <span className="font-display text-lg font-bold text-ink">ThiOnline</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dang-nhap" className="btn btn-primary">
            Đăng nhập
          </Link>
        </div>
      </header>

      {/* Hero — kẻ ô ly vở học sinh */}
      <section className="relative overflow-hidden">
        <div className="grid-paper absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center">
          <p className="mb-4 inline-block rounded-full border border-line2 bg-surface px-3 py-1 text-xs font-medium text-ink2">
            HSA · TSA · V-ACT — đúng khuôn kỳ thi thật
          </p>
          <h1 className="font-display mx-auto max-w-3xl text-[length:var(--step-5)] font-extrabold leading-tight text-ink">
            Từ đề trên giấy đến phòng thi trực tuyến,{" "}
            <span className="text-blu">trong 4 bước</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[length:var(--step-0)] leading-relaxed text-ink2">
            Giáo viên tải đề lên, duyệt đáp án AI sinh, giao cho cả lớp. Học sinh thi ngay trên trình duyệt — đề đảo thứ tự riêng từng em, hết giờ tự khóa phần.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dang-nhap" className="btn btn-primary w-full text-base sm:w-auto">
              Đăng nhập
            </Link>
          </div>
        </div>
      </section>

      {/* 4 bước — dàn trải theo hàng ngang có số to cột trái, như mục lục sách */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-center text-[length:var(--step-3)] font-bold text-ink">Quy trình một kỳ kiểm tra</h2>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-5">
                <span className="font-mono2 shrink-0 text-[length:var(--step-4)] font-bold leading-none text-blu/20">{s.n}</span>
                <div>
                  <h3 className="font-display text-[length:var(--step-1)] font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink2">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chia đôi giáo viên / học sinh — nền mực đậm */}
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-[length:var(--step-2)] font-bold">Dành cho giáo viên</h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-white/80">
              <li>— Soạn đề từ file có sẵn, không gõ lại từ đầu</li>
              <li>— AI sinh đáp án kèm lời giải, duyệt rồi mới phát hành</li>
              <li>— Giao đề theo lịch, giới hạn số lượt làm</li>
              <li>— Báo cáo tự động: điểm, câu sai nhiều, bài chưa nộp</li>
            </ul>
          </div>
          <div>
            <h2 className="font-display text-[length:var(--step-2)] font-bold">Dành cho học sinh</h2>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed text-white/80">
              <li>— Vào thi bằng mã lớp, không cần cài ứng dụng</li>
              <li>— Đồng hồ từng phần như phòng thi thật</li>
              <li>— Đáp án lưu tự động mỗi giây — mất mạng không mất bài</li>
              <li>— Xem điểm và lời giải ngay khi nộp (nếu đề cho phép)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer — con dấu đỏ làm dấu ấn thương hiệu */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="grid-paper absolute inset-0" aria-hidden />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center">
          <div className="seal grid h-20 w-20 place-items-center text-center font-display text-[11px] font-bold uppercase leading-tight">
            Chính xác
            <br />
            100%
          </div>
          <p className="text-sm text-ink2">Tài khoản do quản trị viên cấp — liên hệ trung tâm của bạn để được cấp quyền truy cập.</p>
        </div>
      </section>

      <footer className="border-t border-line bg-surface py-6 text-center text-xs text-ink3">
        ThiOnline — nền tảng luyện thi và kiểm tra trực tuyến
      </footer>
    </main>
  );
}
