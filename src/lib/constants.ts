export const STUDENT_DOMAIN = "@hs.thionline.local";

/** Học sinh tạo hàng loạt đăng nhập bằng "tên đăng nhập" không cần @domain */
export function normalizeLoginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : v + STUDENT_DOMAIN;
}

/** Mã lớp 6 ký tự, bỏ các ký tự dễ nhầm khi đọc to (0/O, 1/I) */
export function generateJoinCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
