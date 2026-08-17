import { createHash, randomBytes } from "crypto";
import { getSetting, setSetting } from "./config.js";

const ALLOWLIST_KEY = "return_url_allowlist";
const API_KEYS_KEY = "partner_api_keys";

export type PartnerApiKeyRecord = {
  id: string;
  name: string;
  /** 明文前缀，便于辨认；完整密钥只在创建时返回一次 */
  prefix: string;
  keyHash: string;
  active: boolean;
  createdAt: string;
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 白名单条目：主机名，如 exchange.com 或 www.exchange.com；也支持 *.exchange.com */
export async function getReturnUrlAllowlist(): Promise<string[]> {
  const raw = await getSetting(ALLOWLIST_KEY, "[]");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x).trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function setReturnUrlAllowlist(hosts: string[]): Promise<string[]> {
  const cleaned = [
    ...new Set(
      hosts
        .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0])
        .filter((h) => /^(\*\.)?[a-z0-9.-]+$/.test(h) && (h.includes(".") || h === "localhost"))
    ),
  ];
  await setSetting(ALLOWLIST_KEY, JSON.stringify(cleaned));
  return cleaned;
}

function hostMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
  const host = hostname.toLowerCase();
  for (const entry of allowlist) {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1); // .example.com
      if (host === entry.slice(2) || host.endsWith(suffix)) return true;
    } else if (host === entry) {
      return true;
    }
  }
  return false;
}

/**
 * 校验并规范化 returnUrl。
 * 未配置白名单时拒绝任意 returnUrl（避免开放跳转）。
 */
export async function normalizeReturnUrl(
  raw: string | null | undefined
): Promise<string | null> {
  const text = (raw || "").trim();
  if (!text) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw Object.assign(new Error("returnUrl 不是合法 URL"), { statusCode: 400 });
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw Object.assign(new Error("returnUrl 仅支持 http/https"), { statusCode: 400 });
  }

  // 生产环境建议 https；本地 http 放行便于联调
  const allowlist = await getReturnUrlAllowlist();
  if (!allowlist.length) {
    throw Object.assign(
      new Error("尚未配置 returnUrl 域名白名单，请管理员在「对接」页添加"),
      { statusCode: 400 }
    );
  }
  if (!hostMatchesAllowlist(url.hostname, allowlist)) {
    throw Object.assign(
      new Error(`returnUrl 域名不在白名单：${url.hostname}`),
      { statusCode: 400 }
    );
  }

  return url.toString();
}

export function buildReturnRedirect(
  returnUrl: string,
  params: {
    status: "ok" | "fail" | "cancel";
    address?: string | null;
    txId?: string | null;
    error?: string | null;
    ref?: string | null;
  }
): string {
  const u = new URL(returnUrl);
  u.searchParams.set("status", params.status);
  if (params.address) u.searchParams.set("address", params.address);
  if (params.txId) u.searchParams.set("txId", params.txId);
  if (params.ref) u.searchParams.set("ref", params.ref);
  if (params.error) u.searchParams.set("error", params.error.slice(0, 200));
  return u.toString();
}

async function loadApiKeys(): Promise<PartnerApiKeyRecord[]> {
  const raw = await getSetting(API_KEYS_KEY, "[]");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PartnerApiKeyRecord[];
  } catch {
    return [];
  }
}

async function saveApiKeys(keys: PartnerApiKeyRecord[]): Promise<void> {
  await setSetting(API_KEYS_KEY, JSON.stringify(keys));
}

export async function listPartnerApiKeys(): Promise<
  Omit<PartnerApiKeyRecord, "keyHash">[]
> {
  const keys = await loadApiKeys();
  return keys.map(({ keyHash: _h, ...rest }) => rest);
}

export async function createPartnerApiKey(name: string): Promise<{
  record: Omit<PartnerApiKeyRecord, "keyHash">;
  /** 仅此一次返回明文 */
  apiKey: string;
}> {
  const trimmed = name.trim().slice(0, 40) || "未命名";
  const secret = randomBytes(24).toString("hex");
  const apiKey = `msk_${secret}`;
  const id = randomBytes(8).toString("hex");
  const prefix = apiKey.slice(0, 12);
  const record: PartnerApiKeyRecord = {
    id,
    name: trimmed,
    prefix,
    keyHash: sha256(apiKey),
    active: true,
    createdAt: new Date().toISOString(),
  };
  const all = await loadApiKeys();
  all.push(record);
  await saveApiKeys(all);
  const { keyHash: _h, ...safe } = record;
  return { record: safe, apiKey };
}

export async function revokePartnerApiKey(id: string): Promise<boolean> {
  const all = await loadApiKeys();
  const idx = all.findIndex((k) => k.id === id);
  if (idx < 0) return false;
  all[idx] = { ...all[idx], active: false };
  await saveApiKeys(all);
  return true;
}

export async function findActivePartnerKey(
  apiKey: string
): Promise<PartnerApiKeyRecord | null> {
  const text = (apiKey || "").trim();
  if (!text.startsWith("msk_")) return null;
  const hash = sha256(text);
  const all = await loadApiKeys();
  return all.find((k) => k.active && k.keyHash === hash) || null;
}

export function extractApiKeyFromRequest(headers: {
  authorization?: string;
  "x-api-key"?: string;
}): string | null {
  const x = headers["x-api-key"]?.trim();
  if (x) return x;
  const auth = headers.authorization?.trim() || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}
