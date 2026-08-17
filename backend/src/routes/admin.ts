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
  hqBaseUrl,
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

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/settings/network", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    let hqThresholdUsdt: number | null = null;
    let allowHighSigners: boolean | null = null;
    try {
      const { fetchHqPolicy } = await import("../hqClient.js");
      const policy = await fetchHqPolicy();
      hqThresholdUsdt = policy.thresholdUsdt;
      allowHighSigners =
        typeof policy.allowHighSigners === "boolean"
          ? policy.allowHighSigners
          : null;
    } catch {
      hqThresholdUsdt = null;
      allowHighSigners = null;
    }
    return {
      network: await getNetwork(),
      hqBaseUrl: hqBaseUrl(),
      hqThresholdUsdt,
      allowHighSigners,
      options: [
        { value: Network.shasta, label: "Shasta 测试网" },
        { value: Network.mainnet, label: "TRON 主网" },
      ],
    };
  });

  app.put("/api/admin/settings/network", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
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

  app.put("/api/admin/open-wallets", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
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

  app.put("/api/admin/ads", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
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
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    return listLowPresets(BRANCH_PRESET_OWNER);
  });

  app.put("/api/admin/presets", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    const body = z
      .object({
        signers: z
          .array(z.object({ address: z.string(), name: z.string().min(1) }))
          .length(2),
      })
      .parse(req.body);
    const owner = BRANCH_PRESET_OWNER;
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
    return prisma.walletRecord.findMany({ orderBy: { openedAt: "desc" }, take: 200 });
  });
}
