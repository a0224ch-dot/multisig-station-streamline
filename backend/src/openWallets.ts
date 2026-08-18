import { z } from "zod";
import { getSetting, setSetting } from "./config.js";

export type OpenWalletDef = {
  id: string;
  name: string;
  /** 简短说明（后台勾选 + 开通页按钮） */
  hint: string;
};

/**
 * 顺序按「首页扫 HTTPS 较易直进 / 注入可识别」优先；TronLink 保留但不排第一。
 * 二维码始终是普通 HTTPS，不因勾选变成某家深链。
 */
export const OPEN_WALLET_CATALOG: OpenWalletDef[] = [
  { id: "tokenpocket", name: "TokenPocket", hint: "首页扫码较易直进授权" },
  { id: "okx", name: "OKX Wallet", hint: "首页扫码较易直进授权" },
  { id: "bitget", name: "Bitget Wallet", hint: "首页扫码较易直进授权" },
  { id: "foxwallet", name: "FoxWallet", hint: "可试首页扫码；不行请用发现/浏览器" },
  { id: "safepal", name: "SafePal", hint: "可试首页扫码；不行请用发现/浏览器" },
  { id: "tronlink", name: "TronLink", hint: "勿用首页扫一扫，请用发现/浏览器粘贴链接" },
  { id: "imtoken", name: "imToken", hint: "建议发现/浏览器打开；开通页已尽量识别注入" },
  { id: "trust", name: "Trust Wallet", hint: "建议发现/浏览器打开链接" },
  { id: "bybit", name: "Bybit Wallet", hint: "建议发现/浏览器打开链接" },
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
    const picked = new Set(parsed.filter((id) => allowed.has(id)));
    const ordered = ALL_IDS.filter((id) => picked.has(id));
    return ordered.length ? ordered : defaultEnabledWalletIds();
  } catch {
    return defaultEnabledWalletIds();
  }
}

export async function setEnabledWalletIds(ids: string[]): Promise<string[]> {
  const allowed = new Set(ALL_IDS);
  const picked = new Set(ids.filter((id) => allowed.has(id)));
  const next = ALL_IDS.filter((id) => picked.has(id));
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
