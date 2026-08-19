import { prisma } from "./db.js";
import { j } from "./json.js";
import { getFullHost, getNetwork } from "./config.js";
import { isValidTronAddress } from "./tron.js";
import { Network } from "./types.js";
import {
  extendMemberExpiry,
  getMemberBillingSettings,
} from "./memberBilling.js";

export type MemberOrderStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
export type MemberOrderType = "REGISTER" | "RENEW";

export function buildUniquePayAmount(baseUsdt: number): number {
  const frac = Math.floor(Math.random() * 899999 + 100000) / 1_000_000;
  return Math.round((baseUsdt + frac) * 1_000_000) / 1_000_000;
}

async function getUsdtContract(network: Network): Promise<{ contract: string; decimals: number }> {
  const row = await prisma.trc20Token.findFirst({
    where: { network, symbol: "USDT", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!row) {
    throw Object.assign(new Error("未配置 USDT 合约，请联系管理员"), { statusCode: 503 });
  }
  return { contract: row.contract, decimals: row.decimals };
}

function orderExpiresAt(ttlMinutes: number): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + ttlMinutes);
  return d;
}

export function serializeMemberOrder(row: {
  id: string;
  type: string;
  status: string;
  amountUsdt: number;
  payToAddress: string;
  usdtContract: string;
  network: string;
  txId: string | null;
  expiresAt: Date;
  paidAt: Date | null;
  createdAt: Date;
  registerCode?: { code: string } | null;
}) {
  return {
    id: row.id,
    type: row.type as MemberOrderType,
    status: row.status as MemberOrderStatus,
    amountUsdt: row.amountUsdt,
    payToAddress: row.payToAddress,
    usdtContract: row.usdtContract,
    network: row.network,
    txId: row.txId,
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    registerCode: row.registerCode?.code ?? null,
  };
}

async function resolvePayAddress(): Promise<string> {
  const settings = await getMemberBillingSettings();
  if (!settings.payEnabled) {
    throw Object.assign(new Error("尚未开启 USDT 购买"), { statusCode: 503 });
  }
  const payTo = settings.payAddress.trim();
  if (!payTo) {
    throw Object.assign(new Error("管理员尚未配置 USDT 收款地址"), { statusCode: 503 });
  }
  if (!(await isValidTronAddress(payTo))) {
    throw Object.assign(new Error("USDT 收款地址无效"), { statusCode: 503 });
  }
  return payTo;
}

export async function createMemberPayOrder(opts: {
  type: MemberOrderType;
  userId?: string;
}) {
  const settings = await getMemberBillingSettings();
  const payTo = await resolvePayAddress();
  const network = await getNetwork();
  if (network !== Network.mainnet) {
    throw Object.assign(new Error("USDT 购买仅支持 TRON 主网"), { statusCode: 400 });
  }
  const base =
    opts.type === "REGISTER" ? settings.regPriceUsdt : settings.renewPriceUsdt;
  const { contract } = await getUsdtContract(network);
  const amountUsdt = buildUniquePayAmount(base);

  if (opts.type === "RENEW") {
    if (!opts.userId) {
      throw Object.assign(new Error("请先登录会员账号"), { statusCode: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: opts.userId } });
    if (!user || user.role !== "MEMBER" || !user.active) {
      throw Object.assign(new Error("仅会员可购买月卡"), { statusCode: 403 });
    }
  }

  return prisma.memberPayOrder.create({
    data: {
      type: opts.type,
      status: "PENDING",
      amountUsdt,
      payToAddress: payTo,
      usdtContract: contract,
      network,
      expiresAt: orderExpiresAt(settings.orderTtlMinutes),
      userId: opts.userId,
    },
  });
}

export async function getMemberPayOrder(id: string) {
  return prisma.memberPayOrder.findUnique({
    where: { id },
    include: { registerCode: { select: { code: true } } },
  });
}

export async function expireStaleMemberOrders(): Promise<number> {
  const res = await prisma.memberPayOrder.updateMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}

function rawAmountMatch(expectedUsdt: number, rawValue: string, decimals: number): boolean {
  const expected = BigInt(Math.round(expectedUsdt * 10 ** decimals));
  try {
    return BigInt(rawValue) === expected;
  } catch {
    return false;
  }
}

type Trc20Transfer = {
  transaction_id: string;
  block_timestamp: number;
  to: string;
  value: string;
  token_info?: { address?: string; decimals?: number };
};

async function fetchRecentTrc20In(
  network: Network,
  address: string,
  contract: string,
  minTimestampMs: number
): Promise<Trc20Transfer[]> {
  const host = getFullHost(network).replace(/\/$/, "");
  const url = new URL(`${host}/v1/accounts/${address}/transactions/trc20`);
  url.searchParams.set("limit", "50");
  url.searchParams.set("only_to", "true");
  url.searchParams.set("contract_address", contract);
  url.searchParams.set("min_timestamp", String(minTimestampMs));

  const headers: Record<string, string> = {};
  if (process.env.TRON_API_KEY) {
    headers["TRON-PRO-API-KEY"] = process.env.TRON_API_KEY;
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`TronGrid trc20 fetch ${res.status}`);
  const body = (await res.json()) as { data?: Trc20Transfer[] };
  return body.data ?? [];
}

async function fulfillRegisterOrder(orderId: string, txId: string) {
  const settings = await getMemberBillingSettings();
  await prisma.$transaction(async (tx) => {
    const order = await tx.memberPayOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PENDING" || order.type !== "REGISTER") return;

    const existingCode = await tx.memberRegisterCode.findFirst({
      where: { orderId: order.id },
    });
    if (existingCode) {
      await tx.memberPayOrder.update({
        where: { id: order.id },
        data: { status: "PAID", txId, paidAt: new Date() },
      });
      return;
    }

    const codeRow = await tx.memberRegisterCode.create({
      data: {
        code: await (async () => {
          const { randomBytes } = await import("crypto");
          for (let i = 0; i < 32; i++) {
            const c = randomBytes(5).toString("hex").toUpperCase();
            const ex = await tx.memberRegisterCode.findUnique({ where: { code: c } });
            if (!ex) return c;
          }
          throw new Error("code_gen_failed");
        })(),
        kind: "register",
        grantDays: settings.regGrantDays,
        priceUsdt: settings.regPriceUsdt,
        orderId: order.id,
      },
    });

    await tx.memberPayOrder.update({
      where: { id: order.id },
      data: { status: "PAID", txId, paidAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        action: "MEMBER_PAY_ORDER_PAID",
        detail: j({
          orderId: order.id,
          type: order.type,
          txId,
          registerCode: codeRow.code,
        }),
      },
    });
  });
}

async function fulfillRenewOrder(orderId: string, txId: string) {
  const settings = await getMemberBillingSettings();
  await prisma.$transaction(async (tx) => {
    const order = await tx.memberPayOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PENDING" || order.type !== "RENEW" || !order.userId) return;

    const user = await tx.user.findUnique({ where: { id: order.userId } });
    if (!user || user.role !== "MEMBER") return;

    const memberExpiresAt = extendMemberExpiry(
      user.memberExpiresAt,
      settings.renewGrantDays
    );

    await tx.memberPayOrder.update({
      where: { id: order.id },
      data: { status: "PAID", txId, paidAt: new Date() },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { memberExpiresAt },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "MEMBER_RENEW_PAID",
        detail: j({
          orderId: order.id,
          txId,
          memberExpiresAt: memberExpiresAt.toISOString(),
          grantDays: settings.renewGrantDays,
        }),
      },
    });
  });
}

async function fulfillOrder(orderId: string, txId: string) {
  const order = await prisma.memberPayOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING") return;
  if (order.type === "REGISTER") await fulfillRegisterOrder(orderId, txId);
  else await fulfillRenewOrder(orderId, txId);
}

let monitorRunning = false;

export async function scanPendingMemberPayments(): Promise<void> {
  if (monitorRunning) return;
  monitorRunning = true;
  try {
    await expireStaleMemberOrders();
    const pending = await prisma.memberPayOrder.findMany({
      where: { status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    if (!pending.length) return;

    const groups = new Map<string, typeof pending>();
    for (const o of pending) {
      const key = `${o.network}:${o.payToAddress}:${o.usdtContract}`;
      const list = groups.get(key) ?? [];
      list.push(o);
      groups.set(key, list);
    }

    for (const [key, orders] of groups) {
      const [network, payTo, contract] = key.split(":");
      const minTs = Math.min(...orders.map((o) => o.createdAt.getTime())) - 60_000;
      let transfers: Trc20Transfer[] = [];
      try {
        transfers = await fetchRecentTrc20In(network as Network, payTo, contract, minTs);
      } catch (e) {
        console.warn("[member-pay] trc20 fetch failed", key, e);
        continue;
      }

      for (const order of orders) {
        const token = await prisma.trc20Token.findFirst({
          where: { network: order.network, contract: order.usdtContract, active: true },
        });
        const decimals = token?.decimals ?? 6;
        for (const tr of transfers) {
          if (tr.to !== order.payToAddress) continue;
          if (tr.token_info?.address && tr.token_info.address !== order.usdtContract) continue;
          if (tr.block_timestamp < order.createdAt.getTime() - 1000) continue;
          if (!rawAmountMatch(order.amountUsdt, tr.value, decimals)) continue;
          const used = await prisma.memberPayOrder.findUnique({
            where: { txId: tr.transaction_id },
          });
          if (used) continue;
          await fulfillOrder(order.id, tr.transaction_id);
          break;
        }
      }
    }
  } finally {
    monitorRunning = false;
  }
}

export function startMemberPaymentMonitor() {
  const ms = Number(process.env.MEMBER_PAY_POLL_MS || 30_000);
  void scanPendingMemberPayments();
  setInterval(() => void scanPendingMemberPayments(), ms);
  console.log(`[member-pay] monitor every ${ms}ms`);
}
