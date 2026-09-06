import Image from "next/image";

/**
 * Logo ThiOnline — phục vụ qua next/image (tự optimize/resize theo kích thước
 * hiển thị, cache CDN). File gốc public/logo.png 1254px chỉ tải đúng 1 lần.
 */
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="ThiOnline"
      width={size}
      height={size}
      priority
      className={`rounded-lg object-contain ${className}`}
    />
  );
}
