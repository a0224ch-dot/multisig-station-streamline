import { Network } from "./types.js";
import { prisma } from "./db.js";

const SETTING_KEY = "active_network";
let cached: Network | null = null;

function parseNetwork(raw: string | null | undefined): Network {
  const v = (raw || "").toLowerCase();
  return v === "shasta" ? Network.shasta : Network.mainnet;
}

export async function getNetwork(): Promise<Network> {
  if (cached) return cached;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    cached = row ? parseNetwork(row.value) : Network.mainnet;
  } catch {
    cached = Network.mainnet;
  }
  return cached;
}

export async function setNetwork(network: Network): Promise<Network> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: network },
    create: { key: SETTING_KEY, value: network },
  });
  cached = network;
  return cached;
}

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export function getFullHost(network: Network): string {
  if (network === Network.mainnet) {
    return process.env.TRON_FULL_HOST_MAINNET || "https://api.trongrid.io";
  }
  return process.env.TRON_FULL_HOST_SHASTA || "https://api.shasta.trongrid.io";
}

/** 仅上游策略不可达时的兜底 */
export function localFallbackThresholdUsdt(): number {
  const n = Number(process.env.VALUE_THRESHOLD_USDT || 500000);
  return Number.isFinite(n) && n > 0 ? n : 500000;
}

export function hqBaseUrl(): string {
  return (process.env.HQ_BASE_URL || "https://multisig-station.iqiyia.cyou").replace(
    /\/$/,
    ""
  );
}

export function branchApiKey(): string {
  return process.env.BRANCH_API_KEY || "";
}
