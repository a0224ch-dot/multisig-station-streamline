import { Role } from "./types.js";
import { getSetting, setSetting } from "./config.js";
import { prisma } from "./db.js";

export type MemberRegisterMode = "off" | "open" | "code_required";

const KEYS = {
  mode: "member_register_mode",
  regPrice: "member_reg_price_usdt",
  renewPrice: "member_renew_price_usdt",
  regDays: "member_reg_grant_days",
  renewDays: "member_renew_grant_days",
  payEnabled: "member_pay_enabled",
  payAddress: "member_pay_address",
  payTtl: "member_pay_order_ttl_minutes",
} as const;

const DEFAULTS = {
  regPrice: 10,
  renewPrice: 30,
  regDays: 7,
  renewDays: 30,
  payTtl: 30,
};

export type MemberBillingSettings = {
  mode: MemberRegisterMode;
  regPriceUsdt: number;
  renewPriceUsdt: number;
  regGrantDays: number;
  renewGrantDays: number;
  payEnabled: boolean;
  payAddress: string;
  orderTtlMinutes: number;
};

function num(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getMemberBillingSettings(): Promise<MemberBillingSettings> {
  const [modeRaw, regPrice, renewPrice, regDays, renewDays, payEnabled, payAddress, payTtl] =
    await Promise.all([
      getSetting(KEYS.mode, ""),
      getSetting(KEYS.regPrice, String(DEFAULTS.regPrice)),
      getSetting(KEYS.renewPrice, String(DEFAULTS.renewPrice)),
      getSetting(KEYS.regDays, String(DEFAULTS.regDays)),
      getSetting(KEYS.renewDays, String(DEFAULTS.renewDays)),
      getSetting(KEYS.payEnabled, "0"),
      getSetting(KEYS.payAddress, ""),
      getSetting(KEYS.payTtl, String(DEFAULTS.payTtl)),
    ]);

  let mode: MemberRegisterMode = "off";
  if (modeRaw === "open" || modeRaw === "code_required") {
    mode = modeRaw;
  } else if (modeRaw === "off") {
    mode = "off";
  } else {
    const legacy = await getSetting("member_register_enabled", "0");
    mode = legacy === "1" ? "open" : "off";
  }

  return {
    mode,
    regPriceUsdt: num(regPrice, DEFAULTS.regPrice),
    renewPriceUsdt: num(renewPrice, DEFAULTS.renewPrice),
    regGrantDays: Math.round(num(regDays, DEFAULTS.regDays)),
    renewGrantDays: Math.round(num(renewDays, DEFAULTS.renewDays)),
    payEnabled: payEnabled === "1",
    payAddress: payAddress.trim(),
    orderTtlMinutes: Math.round(num(payTtl, DEFAULTS.payTtl)),
  };
}

export async function saveMemberBillingSettings(input: {
  mode?: MemberRegisterMode;
  regPriceUsdt?: number;
  renewPriceUsdt?: number;
  regGrantDays?: number;
  renewGrantDays?: number;
  payEnabled?: boolean;
  payAddress?: string;
  orderTtlMinutes?: number;
}): Promise<MemberBillingSettings> {
  const cur = await getMemberBillingSettings();
  const next: MemberBillingSettings = {
    mode: input.mode ?? cur.mode,
    regPriceUsdt: input.regPriceUsdt ?? cur.regPriceUsdt,
    renewPriceUsdt: input.renewPriceUsdt ?? cur.renewPriceUsdt,
    regGrantDays: input.regGrantDays ?? cur.regGrantDays,
    renewGrantDays: input.renewGrantDays ?? cur.renewGrantDays,
    payEnabled: input.payEnabled ?? cur.payEnabled,
    payAddress: input.payAddress !== undefined ? input.payAddress.trim() : cur.payAddress,
    orderTtlMinutes: input.orderTtlMinutes ?? cur.orderTtlMinutes,
  };
  await Promise.all([
    setSetting(KEYS.mode, next.mode),
    setSetting(KEYS.regPrice, String(next.regPriceUsdt)),
    setSetting(KEYS.renewPrice, String(next.renewPriceUsdt)),
    setSetting(KEYS.regDays, String(next.regGrantDays)),
    setSetting(KEYS.renewDays, String(next.renewGrantDays)),
    setSetting(KEYS.payEnabled, next.payEnabled ? "1" : "0"),
    setSetting(KEYS.payAddress, next.payAddress),
    setSetting(KEYS.payTtl, String(next.orderTtlMinutes)),
    setSetting("member_register_enabled", next.mode === "off" ? "0" : "1"),
  ]);
  return getMemberBillingSettings();
}

export function isRegisterOpen(mode: MemberRegisterMode): boolean {
  return mode === "open" || mode === "code_required";
}

export function memberSubscriptionActive(user: {
  role: string;
  active: boolean;
  memberExpiresAt: Date | null;
}): boolean {
  if (user.role !== Role.MEMBER) return true;
  if (!user.active) return false;
  if (!user.memberExpiresAt) return true;
  return user.memberExpiresAt.getTime() > Date.now();
}

export function extendMemberExpiry(
  current: Date | null | undefined,
  days: number,
  from = new Date()
): Date {
  const base =
    current && current.getTime() > from.getTime() ? new Date(current) : new Date(from);
  base.setDate(base.getDate() + days);
  return base;
}

export async function assertMemberSubscription(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true, memberExpiresAt: true },
  });
  if (!user || user.role !== Role.MEMBER) return;
  if (!memberSubscriptionActive(user)) {
    throw Object.assign(new Error("会员权限已过期，请续费后再试"), { statusCode: 403 });
  }
}

export async function assertMemberEntryActive(memberUserId: string): Promise<void> {
  await assertMemberSubscription(memberUserId);
}
