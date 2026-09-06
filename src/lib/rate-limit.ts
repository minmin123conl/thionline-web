import { sql } from "drizzle-orm";
import { db } from "./db";
import { rateLimits } from "./db/schema";

/**
 * Rate limit sliding window dùng chính DB (Neon HTTP không có transaction, serverless
 * không có state chia sẻ). Atomically tăng bộ đếm và reset khi hết cửa sổ.
 * Trả về true nếu CHO PHÉP, false nếu đã vượt giới hạn.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs);
  const rows = await db
    .insert(rateLimits)
    .values({ key, windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} < ${windowStart.toISOString()} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} < ${windowStart.toISOString()} THEN now() ELSE ${rateLimits.windowStart} END`,
      },
      setWhere: sql`CASE WHEN ${rateLimits.windowStart} < ${windowStart.toISOString()} THEN true ELSE ${rateLimits.count} < ${limit} END`,
    })
    .returning({ count: rateLimits.count });
  // Nếu vượt limit, upsert bị setWhere chặn → không có row trả về → từ chối
  return rows.length > 0;
}
