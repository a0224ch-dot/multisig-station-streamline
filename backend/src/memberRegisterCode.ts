import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { getMemberBillingSettings } from "./memberBilling.js";

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidRegisterCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8,24}$/.test(normalizeCode(code));
}

type Db = Prisma.TransactionClient | typeof prisma;

async function uniqueCode(db: Db = prisma): Promise<string> {
  for (let i = 0; i < 32; i++) {
    const code = randomBytes(5).toString("hex").toUpperCase();
    const exists = await db.memberRegisterCode.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw Object.assign(new Error("无法生成注册码，请重试"), { statusCode: 500 });
}

export async function generateMemberRegisterCodes(opts: {
  count: number;
  grantDays?: number;
  codeExpiresInDays?: number;
  createdById: string;
}) {
  const settings = await getMemberBillingSettings();
  const grantDays = opts.grantDays ?? settings.regGrantDays;
  const count = Math.min(Math.max(Math.round(opts.count), 1), 100);
  let codeExpiresAt: Date | undefined;
  if (opts.codeExpiresInDays && opts.codeExpiresInDays > 0) {
    codeExpiresAt = new Date();
    codeExpiresAt.setDate(codeExpiresAt.getDate() + opts.codeExpiresInDays);
  }
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push(
      await prisma.memberRegisterCode.create({
        data: {
          code: await uniqueCode(),
          kind: "register",
          grantDays,
          priceUsdt: settings.regPriceUsdt,
          codeExpiresAt,
          createdById: opts.createdById,
        },
      })
    );
  }
  return rows;
}

export async function consumeRegisterCode(codeInput: string, db: Db = prisma) {
  const code = normalizeCode(codeInput);
  const row = await db.memberRegisterCode.findUnique({ where: { code } });
  if (!row || row.kind !== "register") {
    throw Object.assign(new Error("注册码无效"), { statusCode: 400 });
  }
  if (row.usedAt) {
    throw Object.assign(new Error("注册码已被使用"), { statusCode: 400 });
  }
  if (row.codeExpiresAt && row.codeExpiresAt <= new Date()) {
    throw Object.assign(new Error("注册码已过期"), { statusCode: 400 });
  }
  return row;
}

export async function listMemberRegisterCodes(limit = 200) {
  return prisma.memberRegisterCode.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      usedBy: { select: { id: true, username: true, displayName: true } },
    },
  });
}
