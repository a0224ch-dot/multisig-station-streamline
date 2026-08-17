import type { Network } from "./types.js";
import { branchApiKey, hqBaseUrl } from "./config.js";
import { getNetwork } from "./config.js";
import { prisma } from "./db.js";

export type HqSigner = { address: string; name: string; weight: number };

async function hqFetch(path: string, init?: RequestInit) {
  const key = branchApiKey();
  if (!key) {
    throw Object.assign(new Error("未配置 BRANCH_API_KEY"), { statusCode: 500 });
  }
  const url = `${hqBaseUrl()}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("X-Branch-Api-Key", key);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const mapped =
      res.status === 401 ? 409 : res.status === 403 ? 403 : res.status === 502 || res.status === 503 ? 409 : 409;
    throw Object.assign(
      new Error(String(data.message || data.error || "请求总部失败")),
      { statusCode: mapped }
    );
  }
  return data;
}

export async function registerToHq(profile: {
  name: string;
  contact?: string;
  publicUrl?: string;
  network?: Network;
  openCountHint?: number;
}) {
  return hqFetch("/api/branch/v1/register", {
    method: "POST",
    body: JSON.stringify(profile),
  }) as Promise<{
    ok: boolean;
    branchId: string;
    allowHighSigners: boolean;
    created: boolean;
  }>;
}

export async function heartbeatToHq(profile: {
  name?: string;
  contact?: string;
  publicUrl?: string;
  network?: Network;
  openCountHint?: number;
}) {
  return hqFetch("/api/branch/v1/heartbeat", {
    method: "POST",
    body: JSON.stringify(profile),
  }) as Promise<{
    ok: boolean;
    branchId: string;
    allowHighSigners: boolean;
    thresholdUsdt: number;
  }>;
}

/** 从总部同步折合阈值等策略 */
export async function fetchHqPolicy(): Promise<{
  thresholdUsdt: number;
  allowHighSigners?: boolean;
}> {
  const data = await hqFetch("/api/branch/v1/policy");
  const thresholdUsdt = Number(data.thresholdUsdt);
  if (!Number.isFinite(thresholdUsdt) || thresholdUsdt <= 0) {
    throw Object.assign(new Error("总部返回的阈值无效"), { statusCode: 409 });
  }
  return {
    thresholdUsdt,
    allowHighSigners:
      typeof data.allowHighSigners === "boolean"
        ? data.allowHighSigners
        : undefined,
  };
}

export async function fetchHqHighSigners(network: Network): Promise<{
  threshold: number;
  signers: HqSigner[];
  valueThresholdUsdt?: number;
}> {
  const data = (await hqFetch(
    `/api/branch/v1/high-signers?network=${network}`
  )) as {
    threshold?: number;
    valueThresholdUsdt?: number;
    signers?: HqSigner[];
  };
  if (!data.signers || data.signers.length < 3) {
    throw Object.assign(new Error("总部高档地址不足 3 个"), { statusCode: 409 });
  }
  return {
    threshold: data.threshold ?? 3,
    valueThresholdUsdt: data.valueThresholdUsdt,
    signers: data.signers.slice(0, 3),
  };
}

export async function reportOpenToHq(payload: {
  network: Network;
  address: string;
  tier: "THREE_OF_FOUR";
  signerAddresses: string[];
  openTxId?: string | null;
  openedAt?: string;
}): Promise<{ ok: boolean; id?: string } | null> {
  try {
    const publicUrl =
      process.env.BRANCH_PUBLIC_URL || process.env.FRONTEND_ORIGIN || "";
    const data = (await hqFetch("/api/branch/v1/report-open", {
      method: "POST",
      body: JSON.stringify({ ...payload, publicUrl: publicUrl || undefined }),
    })) as { ok?: boolean; id?: string };
    return { ok: !!data.ok, id: data.id };
  } catch (e) {
    console.warn("[hq] report-open failed", payload.address, e);
    return null;
  }
}

export async function buildHqProfilePayload() {
  const network = await getNetwork();
  const openCountHint = await prisma.walletRecord.count();
  return {
    name: process.env.BRANCH_NAME || "未命名分公司",
    contact: process.env.BRANCH_CONTACT || "",
    publicUrl: process.env.BRANCH_PUBLIC_URL || process.env.FRONTEND_ORIGIN || "",
    network,
    openCountHint,
  };
}
