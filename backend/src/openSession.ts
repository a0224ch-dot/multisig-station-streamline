import { randomBytes } from "crypto";
import { OpenStatus } from "./types.js";
import { prisma } from "./db.js";
import { getNetwork } from "./config.js";
import { publicOrigin } from "./landing.js";
import { normalizeReturnUrl } from "./partner.js";

/**
 * 签名页要先选钱包再签，默认 900 秒。
 * 旧安装脚本把 OPEN_TOKEN_TTL_SECONDS 写死为 300；升级不覆盖 .env，故把 300 视为旧默认并按 900 处理。
 * 要其它时长，设成非 300 的正整数秒。
 */
export function openSessionTtlSeconds(): number {
  const raw = process.env.OPEN_TOKEN_TTL_SECONDS;
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0 || n === 300) return 900;
  return n;
}

export async function createOpenSession(opts: {
  channel: "internal" | "public" | "partner";
  createdById?: string;
  returnUrl?: string | null;
  partnerRef?: string | null;
  partnerKeyId?: string | null;
  /** 会员 User.id；绑定后低档 2/3 用该会员预置 */
  presetOwnerId?: string | null;
}) {
  const ttl = openSessionTtlSeconds();
  const token = randomBytes(24).toString("hex");
  const network = await getNetwork();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const returnUrl = opts.returnUrl
    ? await normalizeReturnUrl(opts.returnUrl)
    : null;
  const session = await prisma.openSession.create({
    data: {
      token,
      channel: opts.channel,
      createdById: opts.createdById,
      network,
      expiresAt,
      status: OpenStatus.PENDING,
      returnUrl: returnUrl || undefined,
      partnerRef: opts.partnerRef || undefined,
      partnerKeyId: opts.partnerKeyId || undefined,
      presetOwnerId: opts.presetOwnerId || undefined,
    },
  });
  const path =
    opts.channel === "internal" ? `/branch/o/${session.token}` : `/o/${session.token}`;
  return {
    sessionId: session.id,
    token: session.token,
    expiresAt: session.expiresAt,
    network,
    openUrl: `${publicOrigin()}${path}`,
    returnUrl: session.returnUrl,
  };
}
