import { z } from "zod";
import { getSetting, setSetting } from "./config.js";

export type OpenWalletDef = {
  id: string;
  name: string;
  /** 简短说明 */
  hint: string;
};

/** 内置主流手机钱包（深链模板在前端组装，后台只勾选 id） */
export const OPEN_WALLET_CATALOG: OpenWalletDef[] = [
  { id: "tronlink", name: "TronLink", hint: "波场官方常用" },
  { id: "okx", name: "OKX Wallet", hint: "欧易钱包" },
  { id: "imtoken", name: "imToken", hint: "常用多链钱包" },
  { id: "tokenpocket", name: "TokenPocket", hint: "TP 钱包" },
  { id: "bitget", name: "Bitget Wallet", hint: "原 BitKeep" },
  { id: "trust", name: "Trust Wallet", hint: "币安系常用" },
  { id: "safepal", name: "SafePal", hint: "软硬钱包" },
  { id: "bybit", name: "Bybit Wallet", hint: "Bybit 钱包" },
  { id: "foxwallet", name: "FoxWallet", hint: "TRON 生态常用" },
];

const SETTING_KEY = "open_wallets_enabled";
const ALL_IDS = OPEN_WALLET_CATALOG.map((w) => w.id);

export function defaultEnabledWalletIds(): string[] {
  return [...ALL_IDS];
}

export async function getEnabledWalletIds(): Promise<string[]> {
  const raw = await getSetting(SETTING_KEY, "");
  if (!raw) return defaultEnabledWalletIds();
  try {
    const parsed = z.array(z.string()).parse(JSON.parse(raw));
    const allowed = new Set(ALL_IDS);
    const filtered = parsed.filter((id) => allowed.has(id));
    return filtered.length ? filtered : defaultEnabledWalletIds();
  } catch {
    return defaultEnabledWalletIds();
  }
}

export async function setEnabledWalletIds(ids: string[]): Promise<string[]> {
  const allowed = new Set(ALL_IDS);
  const next = [...new Set(ids.filter((id) => allowed.has(id)))];
  if (!next.length) {
    throw new Error("至少选择一个钱包入口");
  }
  await setSetting(SETTING_KEY, JSON.stringify(next));
  return next;
}

export async function listEnabledOpenWallets(): Promise<OpenWalletDef[]> {
  const enabled = new Set(await getEnabledWalletIds());
  return OPEN_WALLET_CATALOG.filter((w) => enabled.has(w.id));
}
