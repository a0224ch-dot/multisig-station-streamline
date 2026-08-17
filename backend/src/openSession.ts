import { randomBytes } from "crypto";
import { OpenStatus } from "./types.js";
import { prisma } from "./db.js";
import { getNetwork } from "./config.js";
import { publicOrigin } from "./landing.js";
import { normalizeReturnUrl } from "./partner.js";

export async function createOpenSession(opts: {
  channel: "internal" | "public" | "partner";
  createdById?: string;
  returnUrl?: string | null;
  partnerRef?: string | null;
  partnerKeyId?: string | null;
  /** 会员 User.id；绑定后低档 2/3 用该会员预置 */
  presetOwnerId?: string | null;
}) {
  const ttl = Number(process.env.OPEN_TOKEN_TTL_SECONDS || 300);
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
