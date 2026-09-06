import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();

  // Đã đăng nhập → vào thẳng khu làm việc theo vai trò
  const homeByRole: Record<string, string> = {
    ADMIN: "/admin",
    TEACHER: "/giao-vien",
    STUDENT: "/hoc-sinh",
  };
  if (user && homeByRole[user.role]) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4">
        <p className="text-sm text-slate-500">Bạn đang đăng nhập với vai trò {user.role === "ADMIN" ? "Quản trị viên" : user.role === "TEACHER" ? "Giáo viên" : "Học sinh"}.</p>
        <div className="flex gap-3">
          <Link href={homeByRole[user.role]} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800">
            Vào khu làm việc →
          </Link>
          <Link href="/api/auth/logout" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Đăng xuất
          </Link>
        </div>
      </main>
    );
  }

  // Chưa đăng nhập → landing page
  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-700 text-lg font-bold text-white">T</span>
          <span className="text-lg font-bold text-slate-900">ThiOnline</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dang-nhap" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Đăng nhập
          </Link>
          <Link href="/dang-ky" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            Đăng ký miễn phí
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 text-center sm:pt-16">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Số hóa đề thi, tổ chức kiểm tra trực tuyến — <span className="text-blue-700">trong vài phút</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Tải đề lên file Word/PDF, hệ thống tự tách câu hỏi, sinh đáp án bằng AI, giao đề cho cả lớp và chấm điểm tự động.
          Học sinh thi trực tuyến với đề đã được đảo thứ tự chống nhìn bài.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/dang-ky" className="w-full rounded-lg bg-blue-700 px-6 py-3 text-center text-base font-semibold text-white hover:bg-blue-800 sm:w-auto">
            Bắt đầu miễn phí
          </Link>
          <Link href="/dang-nhap" className="w-full rounded-lg border border-slate-300 bg-white px-6 py-3 text-center text-base font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto">
            Đã có tài khoản
          </Link>
        </div>
      </section>

      {/* Tính năng */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold text-slate-900">Một nền tảng — trọn quy trình</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Số hóa đề tự động",
                desc: "Tải đề .docx hoặc PDF — hệ thống tách câu trắc nghiệm, điền khuyết, đúng/sai; PDF scan được OCR tiếng Việt offline.",
                icon: "📄",
              },
              {
                title: "AI sinh đáp án & lời giải",
                desc: "Gemini đề xuất đáp án cho câu còn thiếu và viết lời giải chi tiết — giáo viên duyệt lại trước khi phát hành.",
                icon: "🤖",
              },
              {
                title: "Phòng thi trực tuyến",
                desc: "Chia phần thi theo giờ riêng, tự chấm và tự nộp khi hết giờ — học sinh tắt máy cũng không lo mất bài.",
                icon: "⏱️",
              },
              {
                title: "Chống gian lận",
                desc: "Đảo thứ tự câu và lựa chọn theo từng học sinh (seed riêng), đề đóng băng snapshot — sửa đề sau đó không ảnh hưởng bài đang thi.",
                icon: "🛡️",
              },
              {
                title: "Quản lý lớp học",
                desc: "Tạo lớp, mời học sinh bằng mã, tạo hàng loạt tài khoản, giao đề theo lịch mở/đóng rõ ràng.",
                icon: "🏫",
              },
              {
                title: "Báo cáo tức thì",
                desc: "Điểm từng phần, câu nào sai nhiều nhất, lxem chi tiết từng bài làm — xuất cho giáo viên chấm thi.",
                icon: "📊",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Phân vai */}
      <section className="bg-slate-900">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-white">Dành cho giáo viên</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
              <li>✓ Soạn và duyệt đề từ file có sẵn — không gõ lại</li>
              <li>✓ Giao đề cho lớp với số lượt làm và thời gian tùy chọn</li>
              <li>✓ Theo dõi bài làm đang diễn ra, khóa bài quá hạn</li>
              <li>✓ Báo cáo kết quả tự động sau khi học sinh nộp</li>
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Dành cho học sinh</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
              <li>✓ Vào phòng thi bằng mã lớp, không cần cài app</li>
              <li>✓ Làm bài từng phần, đồng hồ hiển thị đúng thời gian còn lại</li>
              <li>✓ Đáp án lưu tự động, mất mạng vẫn không mất bài</li>
              <li>✓ Xem điểm và lời giải ngay sau khi nộp (nếu đề cho phép)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-slate-50 py-16 text-center">
        <h2 className="text-2xl font-bold text-slate-900">Sẵn sàng tổ chức kỳ kiểm tra đầu tiên?</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">Miễn phí, không giới hạn số đề cho giáo viên Việt Nam.</p>
        <Link href="/dang-ky" className="mt-6 inline-block rounded-lg bg-blue-700 px-6 py-3 text-base font-semibold text-white hover:bg-blue-800">
          Tạo tài khoản giáo viên →
        </Link>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        ThiOnline — Nền tảng luyện thi và kiểm tra trực tuyến
      </footer>
    </main>
  );
}
