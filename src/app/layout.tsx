import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const bez = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-bevietnam",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ThiOnline — Luyện thi và kiểm tra trực tuyến",
  description: "Làm đề kiểm tra của giáo viên và luyện thi đánh giá năng lực HSA, TSA, V-ACT ngay trên trình duyệt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${bez.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-base text-ink antialiased">{children}</body>
    </html>
  );
}
