/** @type {import('next').NextConfig} */
const nextConfig = {
  // mupdf là native module (node-gyp) — không được webpack bundler.
  // tesseract.js chạy server-side, để external cho an toàn.
  // (pdf-parse đã bỏ — thay bằng mupdf để không lỗi DOMMatrix trên serverless)
  // (Next 14 dùng experimental.serverComponentsExternalPackages)
  experimental: {
    serverComponentsExternalPackages: ["mupdf", "tesseract.js"],
  },
};

export default nextConfig;
