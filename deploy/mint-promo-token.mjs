/**
 * 本地 mint 管理端 JWT，供 capture-promo-screenshots 注入（跳过验证码）
 * 用法：cd backend && cp .env.example .env && npm i && npx prisma migrate deploy && npm run seed
 *       node ../deploy/mint-promo-token.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const secret = process.env.JWT_SECRET || "streamline-dev-jwt-change-me";

const user = await prisma.user.findFirst({
  where: { username: "admin", active: true },
  select: { id: true, username: true, role: true },
});
if (!user) {
  console.error("admin user not found — run npm run seed in backend");
  process.exit(1);
}

const token = jwt.sign(
  { sub: user.id, role: user.role, username: user.username },
  secret,
  { expiresIn: "2h" }
);
console.log(token);
await prisma.$disconnect();
