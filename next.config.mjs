/** @type {import('next').NextConfig} */
const nextConfig = {
  // mupdf là native module (node-gyp) — không được webpack bundler.
  // tesseract.js + pdf-parse chạy server-side, để external cho an toàn.
  // (Next 14 dùng experimental.serverComponentsExternalPackages)
  experimental: {
    serverComponentsExternalPackages: ["mupdf", "tesseract.js", "pdf-parse"],
  },
};

export default nextConfig;
