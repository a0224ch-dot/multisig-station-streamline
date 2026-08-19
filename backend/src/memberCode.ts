import { randomBytes } from "crypto";
import { prisma } from "./db.js";
import { getMemberBillingSettings, isRegisterOpen } from "./memberBilling.js";

export const MEMBER_SCENARIO_LIMIT = 5;

/** 系统短码：8 位 hex，不可猜用户名 */
export async function allocateMemberCode(): Promise<string> {
  for (let i = 0; i < 32; i++) {
    const code = randomBytes(4).toString("hex");
    const exists = await prisma.user.findUnique({ where: { memberCode: code } });
    if (!exists) return code;
  }
  throw Object.assign(new Error("无法分配会员码，请重试"), { statusCode: 500 });
}

export function isValidMemberCode(code: string): boolean {
  return /^[a-f0-9]{8}$/i.test(code.trim());
}

/** 是否开放公网注册（含需注册码模式） */
export async function isMemberRegisterEnabled(): Promise<boolean> {
  const s = await getMemberBillingSettings();
  return isRegisterOpen(s.mode);
}

/** @deprecated 请用 saveMemberBillingSettings({ mode }) */
export async function setMemberRegisterEnabled(on: boolean): Promise<boolean> {
  const { saveMemberBillingSettings } = await import("./memberBilling.js");
  await saveMemberBillingSettings({ mode: on ? "open" : "off" });
  return on;
}
