import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThiOnline — Luyện thi và kiểm tra trực tuyến",
  description: "Làm đề kiểm tra của giáo viên và luyện thi đánh giá năng lực HSA, TSA, V-ACT ngay trên trình duyệt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
