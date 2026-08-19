import type { FastifyReply } from "fastify";
import { getSetting, setSetting } from "./config.js";

export type AccessMode = "full" | "limited" | "blocked";

export type HqLicensePayload = {
  licenseActive: boolean;
  subscriptionUntil: string | null;
  plan: string;
  edition?: string;
  licenseMessage: string;
  accessMode: AccessMode;
  monthlyPriceUsdt: number;
  trialDays?: number;
  renewDays?: number;
  graceHours?: number;
  paymentEnabled?: boolean;
  orderTtlMinutes?: number;
};

const CACHE_KEYS = {
  licenseActive: "license_active",
  subscriptionUntil: "license_subscription_until",
  plan: "license_plan",
  licenseMessage: "license_message",
  monthlyPriceUsdt: "license_monthly_price_usdt",
  graceHours: "license_grace_hours",
  paymentEnabled: "license_payment_enabled",
  lastSyncAt: "license_last_sync_at",
} as const;

const DEFAULT_GRACE_HOURS = 48;

export async function saveLicenseFromHq(payload: HqLicensePayload): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all([
    setSetting(CACHE_KEYS.licenseActive, payload.licenseActive ? "1" : "0"),
    setSetting(CACHE_KEYS.subscriptionUntil, payload.subscriptionUntil || ""),
    setSetting(CACHE_KEYS.plan, payload.plan || "none"),
    setSetting(CACHE_KEYS.licenseMessage, payload.licenseMessage || ""),
    setSetting(
      CACHE_KEYS.monthlyPriceUsdt,
      String(payload.monthlyPriceUsdt || 50)
    ),
    setSetting(
      CACHE_KEYS.graceHours,
      String(payload.graceHours ?? DEFAULT_GRACE_HOURS)
    ),
    setSetting(
      CACHE_KEYS.paymentEnabled,
      payload.paymentEnabled ? "1" : "0"
    ),
    setSetting(CACHE_KEYS.lastSyncAt, now),
  ]);
}

type CachedLicense = {
  licenseActive: boolean;
  subscriptionUntil: string | null;
  plan: string;
  licenseMessage: string;
  monthlyPriceUsdt: number;
  graceHours: number;
  paymentEnabled: boolean;
  lastSyncAt: string | null;
};

async function readCachedLicense(): Promise<CachedLicense> {
  const [
    licenseActiveRaw,
    subscriptionUntil,
    plan,
    licenseMessage,
    monthlyPriceRaw,
    graceHoursRaw,
    paymentEnabledRaw,
    lastSyncAt,
  ] = await Promise.all([
    getSetting(CACHE_KEYS.licenseActive, "1"),
    getSetting(CACHE_KEYS.subscriptionUntil, ""),
    getSetting(CACHE_KEYS.plan, "none"),
    getSetting(CACHE_KEYS.licenseMessage, ""),
    getSetting(CACHE_KEYS.monthlyPriceUsdt, "50"),
    getSetting(CACHE_KEYS.graceHours, String(DEFAULT_GRACE_HOURS)),
    getSetting(CACHE_KEYS.paymentEnabled, "0"),
    getSetting(CACHE_KEYS.lastSyncAt, ""),
  ]);
  const monthlyPriceUsdt = Number(monthlyPriceRaw);
  const graceHours = Number(graceHoursRaw);
  return {
    licenseActive: licenseActiveRaw !== "0",
    subscriptionUntil: subscriptionUntil || null,
    plan: plan || "none",
    licenseMessage: licenseMessage || "",
    monthlyPriceUsdt:
      Number.isFinite(monthlyPriceUsdt) && monthlyPriceUsdt > 0
        ? monthlyPriceUsdt
        : 50,
    graceHours:
      Number.isFinite(graceHours) && graceHours > 0
        ? Math.round(graceHours)
        : DEFAULT_GRACE_HOURS,
    paymentEnabled: paymentEnabledRaw === "1",
    lastSyncAt: lastSyncAt || null,
  };
}

function computeModeFromCache(cached: CachedLicense): AccessMode {
  if (!cached.licenseActive) return "blocked";
  if (
    cached.subscriptionUntil &&
    new Date(cached.subscriptionUntil) <= new Date()
  ) {
    return "limited";
  }
  return "full";
}

/** 本地 accessMode：48h 宽限期外且从未同步 → limited */
export async function getLocalAccessMode(): Promise<AccessMode> {
  const cached = await readCachedLicense();
  if (!cached.lastSyncAt) return "limited";
  const graceMs = cached.graceHours * 60 * 60 * 1000;
  const stale = Date.now() - new Date(cached.lastSyncAt).getTime() > graceMs;
  if (stale) return "limited";
  return computeModeFromCache(cached);
}

export async function getLicenseStatus() {
  const cached = await readCachedLicense();
  const accessMode = await getLocalAccessMode();
  const graceMs = cached.graceHours * 60 * 60 * 1000;
  const lastSyncMs = cached.lastSyncAt
    ? Date.now() - new Date(cached.lastSyncAt).getTime()
    : null;
  return {
    accessMode,
    licenseActive: cached.licenseActive,
    subscriptionUntil: cached.subscriptionUntil,
    plan: cached.plan,
    licenseMessage: cached.licenseMessage,
    monthlyPriceUsdt: cached.monthlyPriceUsdt,
    graceHours: cached.graceHours,
    lastSyncAt: cached.lastSyncAt,
    graceRemainingMs:
      lastSyncMs != null ? Math.max(0, graceMs - lastSyncMs) : 0,
    paymentEnabled: cached.paymentEnabled,
    hqConfigured: Boolean(process.env.HQ_BASE_URL && process.env.BRANCH_API_KEY),
  };
}

export async function assertFullAccess(reply: FastifyReply): Promise<boolean> {
  const mode = await getLocalAccessMode();
  const status = await getLicenseStatus();
  if (mode === "blocked") {
    reply.code(403).send({
      error: "license_blocked",
      message: status.licenseMessage || "站点授权已停用，请联系总部",
      accessMode: mode,
    });
    return false;
  }
  if (mode === "limited") {
    reply.code(403).send({
      error: "license_limited",
      message:
        status.licenseMessage ||
        "月卡已过期或未验证授权，请续费或检查与总部的网络连接",
      accessMode: mode,
    });
    return false;
  }
  return true;
}

/** 公网开通：blocked 与 limited 均拦截 */
export async function assertPublicOpenAllowed(
  reply: FastifyReply
): Promise<boolean> {
  return assertFullAccess(reply);
}

/** 主动向总部心跳，刷新本地授权缓存（含月卡价） */
export async function refreshLicenseFromHq(): Promise<void> {
  if (!process.env.HQ_BASE_URL?.trim() || !process.env.BRANCH_API_KEY?.trim()) {
    return;
  }
  const { heartbeatToHq, buildHqProfilePayload } = await import("./hqClient.js");
  await heartbeatToHq(await buildHqProfilePayload());
}
