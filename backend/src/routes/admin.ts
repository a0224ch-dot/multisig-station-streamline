import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Network, Role } from "../types.js";
import { prisma } from "../db.js";
import { getUser, requireRoles } from "../auth.js";
import {
  getNetwork,
  setNetwork,
  getSetting,
  setSetting,
} from "../config.js";
import { j } from "../json.js";
import {
  OPEN_WALLET_CATALOG,
  getEnabledWalletIds,
  listEnabledOpenWallets,
  setEnabledWalletIds,
} from "../openWallets.js";
import { BRANCH_PRESET_OWNER } from "../types.js";
import { listLowPresets, saveLowPresets } from "../presets.js";
import { assertFullAccess, getLicenseStatus, refreshLicenseFromHq } from "../license.js";
import { assertMemberSubscription } from "../memberBilling.js";
import {
  createSubscriptionOrderAtHq,
  fetchSubscriptionOrderAtHq,
  heartbeatToHq,
  buildHqProfilePayload,
} from "../hqClient.js";

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/license/status", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE, Role.MEMBER]);
    const q = z
      .object({ sync: z.enum(["0", "1"]).optional() })
      .parse(req.query ?? {});
    const cur = await getLicenseStatus();
    const force = q.sync === "1";
    const staleMs = cur.lastSyncAt
      ? Date.now() - new Date(cur.lastSyncAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (
      u.role !== Role.MEMBER &&
      cur.hqConfigured &&
      (force || staleMs > 15_000)
    ) {
      try {
        await refreshLicenseFromHq();
      } catch (e) {
        req.log.warn(
          e,
          "[license] refresh from HQ failed, returning cached status"
        );
      }
    }
    return getLicenseStatus();
  });

  app.post("/api/admin/license/sync", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    try {
      await refreshLicenseFromHq();
      return getLicenseStatus();
    } catch (e) {
      const message = e instanceof Error ? e.message : "sync_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/admin/license/orders", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    try {
      const order = await createSubscriptionOrderAtHq();
      await prisma.auditLog.create({
        data: {
          userId: u.sub,
          action: "LICENSE_ORDER_CREATE",
          detail: j({ orderId: order.id, amountUsdt: order.amountUsdt }),
        },
      });
      return { ok: true, order };
    } catch (e) {
      const message = e instanceof Error ? e.message : "create_order_failed";
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 500;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.get("/api/admin/license/orders/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    try {
      const order = await fetchSubscriptionOrderAtHq(id);
      if (order.status === "PAID") {
        void heartbeatToHq(await buildHqProfilePayload()).catch(() => {});
      }
      return { ok: true, order };
    } catch (e) {
      const message = e instanceof Error ? e.message : "order_fetch_failed";
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 500;
      return reply.code(statusCode).send({ error: message });
    }
  });
  app.get("/api/admin/settings/network", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    return {
      network: await getNetwork(),
      options: [
        { value: Network.shasta, label: "Shasta 测试网" },
        { value: Network.mainnet, label: "TRON 主网" },
      ],
    };
  });

  app.put("/api/admin/settings/network", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
    if (!(await assertFullAccess(reply))) return;
    const body = z.object({ network: z.enum(["mainnet", "shasta"]) }).parse(req.body);
    const network = await setNetwork(body.network as Network);
    await prisma.auditLog.create({
      data: { userId: u.sub, action: "NETWORK_SWITCH", detail: j({ to: network }) },
    });
    return { network };
  });

  app.get("/api/admin/open-wallets", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    return {
      catalog: OPEN_WALLET_CATALOG,
      enabled: await getEnabledWalletIds(),
    };
  });

  app.put("/api/admin/open-wallets", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    if (!(await assertFullAccess(reply))) return;
    const body = z.object({ enabled: z.array(z.string()).min(1) }).parse(req.body);
    const enabled = await setEnabledWalletIds(body.enabled);
    await prisma.auditLog.create({
      data: {
        userId: u.sub,
        action: "OPEN_WALLETS_UPDATE",
        detail: j({ enabled }),
      },
    });
    return { catalog: OPEN_WALLET_CATALOG, enabled };
  });

  app.get("/api/admin/ads", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
    return {
      sideHtml: await getSetting("ad_side_html", ""),
      bottomHtml: await getSetting("ad_bottom_html", ""),
      exchangeUrl: await getSetting(
        "exchange_url",
        "https://www.example.com"
      ),
    };
  });

  app.put("/api/admin/ads", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
    if (!(await assertFullAccess(reply))) return;
    const body = z
      .object({
        sideHtml: z.string().optional(),
        bottomHtml: z.string().optional(),
        exchangeUrl: z.string().optional(),
      })
      .parse(req.body);
    if (body.sideHtml !== undefined) await setSetting("ad_side_html", body.sideHtml);
    if (body.bottomHtml !== undefined) await setSetting("ad_bottom_html", body.bottomHtml);
    if (body.exchangeUrl !== undefined) await setSetting("exchange_url", body.exchangeUrl);
    await prisma.auditLog.create({
      data: { userId: u.sub, action: "ADS_UPDATE", detail: j({}) },
    });
    return { ok: true };
  });

  app.get("/api/admin/presets", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE, Role.MEMBER]);
    const owner = u.role === Role.MEMBER ? u.sub : BRANCH_PRESET_OWNER;
    return listLowPresets(owner);
  });

  app.put("/api/admin/presets", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE, Role.MEMBER]);
    if (!(await assertFullAccess(reply))) return;
    if (u.role === Role.MEMBER) {
      try {
        await assertMemberSubscription(u.sub);
      } catch (e) {
        const message = e instanceof Error ? e.message : "会员权限已过期";
        return reply.code(403).send({ error: message });
      }
    }
    const body = z
      .object({
        signers: z
          .array(z.object({ address: z.string(), name: z.string().min(1) }))
          .length(2),
      })
      .parse(req.body);
    const owner = u.role === Role.MEMBER ? u.sub : BRANCH_PRESET_OWNER;
    try {
      const list = await saveLowPresets(owner, body.signers);
      await prisma.auditLog.create({
        data: {
          userId: u.sub,
          action: "PRESET_LOW_UPDATE",
          detail: j({ owner, network: await getNetwork(), count: 2 }),
        },
      });
      return list;
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败";
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.get("/api/admin/wallets", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    // 精简版「已开通」只展示本站低档 2/3；高档由上游台账查看
    return prisma.walletRecord.findMany({
      where: { tier: "TWO_OF_THREE" },
      orderBy: { openedAt: "desc" },
      take: 200,
    });
  });
}
