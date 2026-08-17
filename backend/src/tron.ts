import type { Network } from "./types.js";
import { BRANCH_PRESET_OWNER } from "./types.js";
import { prisma } from "./db.js";
import { getFullHost } from "./config.js";
import { fetchHqHighSigners } from "./hqClient.js";
import { normalizePresetOwnerId } from "./presets.js";
import { loadQuoteMap, refreshMarketQuotes, missingPriceError, PRICE_REQUIRED_DUST } from "./prices.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TronWebInstance = any;

/** tronweb 5.x 只有默认导出，6.x 才有具名导出；两者都要能用 */
async function loadTronWebCtor(): Promise<new (opts: unknown) => TronWebInstance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import("tronweb")) as any;
  const ctor = mod?.TronWeb ?? mod?.default?.TronWeb ?? mod?.default ?? mod;
  if (typeof ctor !== "function") {
    throw new Error("TronWeb 模块加载失败，请重装后端依赖");
  }
  return ctor;
}

async function createTronWeb(network: Network): Promise<TronWebInstance> {
  const TronWeb = await loadTronWebCtor();
  const headers: Record<string, string> = {};
  if (process.env.TRON_API_KEY) {
    headers["TRON-PRO-API-KEY"] = process.env.TRON_API_KEY;
  }
  return new TronWeb({ fullHost: getFullHost(network), headers });
}

function isValidBase58(addr: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
}

/** 地址校验与网络无关，复用一个实例即可 */
let validatorPromise: Promise<TronWebInstance> | null = null;
async function getAddressValidator(): Promise<TronWebInstance> {
  if (!validatorPromise) {
    validatorPromise = createTronWeb("mainnet" as Network);
  }
  return validatorPromise;
}

/** 正则只看长相，这里再校验 base58 校验位，避免错字地址流到链上调用 */
export async function isValidTronAddress(addr: string): Promise<boolean> {
  if (!isValidBase58(addr)) return false;
  try {
    const tw = await getAddressValidator();
    return tw.isAddress(addr) === true;
  } catch {
    return false;
  }
}

export async function assertTronAddress(addr: string, label: string): Promise<void> {
  if (!(await isValidTronAddress(addr))) {
    throw Object.assign(new Error(`${label}地址无效：${addr}`), {
      statusCode: 400,
    });
  }
}

/**
 * 折合 USDT = TRX×市价 + Σ(已登记 TRC20×价)。
 * 有余额却无市价时拒绝静默按 0（避免误判档位）。
 */
export async function sumTrc20ValueUsdt(network: Network, walletAddress: string) {
  if (!isValidBase58(walletAddress)) {
    throw Object.assign(new Error("Invalid TRON address"), { statusCode: 400 });
  }
  const tokens = await prisma.trc20Token.findMany({ where: { network, active: true } });
  const nonStableSyms = tokens.filter((t) => !t.isStableUsd).map((t) => t.symbol);
  const quoteSyms = ["TRX", ...nonStableSyms];
  await refreshMarketQuotes(quoteSyms);
  let quoteMap = await loadQuoteMap();

  const needForce = quoteSyms.filter((s) => !(Number(quoteMap.get(s.toUpperCase()) ?? 0) > 0));
  if (needForce.length > 0) {
    await refreshMarketQuotes(needForce, { force: true });
    quoteMap = await loadQuoteMap();
  }

  const tronWeb = await createTronWeb(network);
  const breakdown: { symbol: string; balance: number; usdt: number }[] = [];
  let totalUsdt = 0;

  let trxBalance = 0;
  try {
    const sun = await tronWeb.trx.getBalance(walletAddress);
    trxBalance = Number(sun) / 1e6;
  } catch (e) {
    console.error("[valuation] 读取 TRX 余额失败", walletAddress, e);
    throw Object.assign(new Error("无法读取地址 TRX 余额，请稍后重试"), { statusCode: 409 });
  }
  const trxPrice = quoteMap.get("TRX") ?? 0;
  if (trxBalance > PRICE_REQUIRED_DUST && !(trxPrice > 0)) {
    throw missingPriceError("TRX", trxBalance);
  }
  const trxUsdt = trxBalance * trxPrice;
  totalUsdt += trxUsdt;
  breakdown.push({ symbol: "TRX", balance: trxBalance, usdt: trxUsdt });

  for (const token of tokens) {
    try {
      const contract = await tronWeb.contract().at(token.contract);
      const raw = await contract.balanceOf(walletAddress).call();
      const rawStr =
        typeof raw === "object" && raw._hex ? BigInt(raw._hex).toString() : String(raw);
      const balance = Number(rawStr) / 10 ** token.decimals;
      const price = token.isStableUsd ? 1 : quoteMap.get(token.symbol.toUpperCase()) ?? 0;
      if (!token.isStableUsd && balance > PRICE_REQUIRED_DUST && !(price > 0)) {
        throw missingPriceError(token.symbol, balance);
      }
      const usdt = balance * price;
      totalUsdt += usdt;
      breakdown.push({ symbol: token.symbol, balance, usdt });
    } catch (e) {
      if (e && typeof e === "object" && "statusCode" in e) throw e;
      console.warn(`[valuation] 读取 ${token.symbol} 余额失败，按 0 计`, walletAddress);
      breakdown.push({ symbol: token.symbol, balance: 0, usdt: 0 });
    }
  }
  return { totalUsdt, breakdown };
}

export type PermissionPlan = {
  tier: "TWO_OF_THREE" | "THREE_OF_FOUR" | "THREE_OF_FIVE";
  threshold: number;
  keys: { address: string; name: string; weight: number }[];
  source: "branch" | "hq";
};

export async function buildPermissionPlan(
  network: Network,
  ownerAddress: string,
  totalUsdt: number,
  thresholdLine: number,
  opts?: { presetOwnerId?: string | null }
): Promise<PermissionPlan> {
  const high = totalUsdt > thresholdLine;
  const presetOwner = normalizePresetOwnerId(opts?.presetOwnerId);

  if (high) {
    const hq = await fetchHqHighSigners(network);
    for (const s of hq.signers) {
      if (!(await isValidTronAddress(s.address))) {
        throw Object.assign(
          new Error(`预置地址无效（${s.name || s.address}），请联系管理员核对`),
          { statusCode: 409 }
        );
      }
      if (s.address === ownerAddress) {
        throw Object.assign(new Error("预置地址不能与本人相同"), { statusCode: 400 });
      }
    }
    return {
      tier: "THREE_OF_FOUR",
      threshold: hq.threshold,
      source: "hq",
      keys: [
        { address: ownerAddress, name: "本人", weight: 1 },
        ...hq.signers.map((s) => ({
          address: s.address,
          name: s.name,
          weight: s.weight || 1,
        })),
      ],
    };
  }

  const presets = await prisma.presetSigner.findMany({
    where: {
      network,
      group: "LOW",
      ownerUserId: presetOwner,
      active: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  if (presets.length < 2) {
    const msg =
      presetOwner === BRANCH_PRESET_OWNER
        ? "分公司多签地址不足 2 个"
        : "该会员尚未配齐多签地址，暂无法从此入口开通";
    throw Object.assign(new Error(msg), { statusCode: 400 });
  }
  const picked = presets.slice(0, 2);
  for (const p of picked) {
    if (!(await isValidTronAddress(p.address))) {
      throw Object.assign(
        new Error(`多签地址无效（${p.name}：${p.address}），请在后台「多签地址」重新填写`),
        { statusCode: 400 }
      );
    }
    if (p.address === ownerAddress) {
      throw Object.assign(new Error("预置地址不能与本人相同"), { statusCode: 400 });
    }
  }
  return {
    tier: "TWO_OF_THREE",
    threshold: 2,
    source: "branch",
    keys: [
      { address: ownerAddress, name: "本人", weight: 1 },
      ...picked.map((p) => ({ address: p.address, name: p.name, weight: 1 })),
    ],
  };
}

/** 在默认 60 秒基础上再延长，使总有效期约 60 分钟（链上限 24h） */
const PERMISSION_TX_EXTRA_TTL_SEC = 3540;

export async function buildUpdatePermissionTx(
  network: Network,
  ownerAddress: string,
  plan: PermissionPlan
) {
  const tronWeb = await createTronWeb(network);
  const permissionKeys = plan.keys.map((k) => ({
    address: tronWeb.address.toHex(k.address),
    weight: k.weight,
  }));
  const ownerPermission = {
    type: 0,
    permission_name: "owner",
    threshold: plan.threshold,
    keys: permissionKeys,
  };
  const activePermission = {
    type: 2,
    permission_name: "active",
    threshold: plan.threshold,
    operations: "7fff1fc0033e0000000000000000000000000000000000000000000000000000",
    keys: permissionKeys,
  };
  const tx = await tronWeb.transactionBuilder.updateAccountPermissions(
    ownerAddress,
    ownerPermission,
    null,
    [activePermission]
  );
  // 默认只给 60 秒，手机上唤起钱包、确认往往不够，延长到约 60 分钟
  try {
    return await tronWeb.transactionBuilder.extendExpiration(tx, PERMISSION_TX_EXTRA_TTL_SEC);
  } catch (e) {
    console.warn("[open] 延长交易有效期失败，沿用默认 60 秒", e);
    return tx;
  }
}

export { isValidBase58, createTronWeb };
