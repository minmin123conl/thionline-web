import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Thiếu DATABASE_URL (chuỗi kết nối Neon). Chạy: node --env-file=.env scripts/migrate.mjs");
  process.exit(1);
}
const db = drizzle(neon(url));
console.log("Applying migrations to Neon...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
