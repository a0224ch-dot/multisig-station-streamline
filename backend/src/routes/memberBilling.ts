import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Role } from "../types.js";
import { getUser, requireRoles } from "../auth.js";
import { assertFullAccess } from "../license.js";
import {
  getMemberBillingSettings,
  saveMemberBillingSettings,
  extendMemberExpiry,
  memberSubscriptionActive,
  type MemberRegisterMode,
} from "../memberBilling.js";
import {
  generateMemberRegisterCodes,
  listMemberRegisterCodes,
} from "../memberRegisterCode.js";
import {
  createMemberPayOrder,
  getMemberPayOrder,
  scanPendingMemberPayments,
  serializeMemberOrder,
} from "../memberPayment.js";
import { prisma } from "../db.js";
import { j } from "../json.js";
import { isValidTronAddress } from "../tron.js";

export async function registerMemberBillingRoutes(app: FastifyInstance) {
  app.get("/api/admin/member-billing", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    return getMemberBillingSettings();
  });

  app.put("/api/admin/member-billing", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
    if (!(await assertFullAccess(reply))) return;
    const body = z
      .object({
        mode: z.enum(["off", "open", "code_required"]).optional(),
        regPriceUsdt: z.number().positive().max(1_000_000).optional(),
        renewPriceUsdt: z.number().positive().max(1_000_000).optional(),
        regGrantDays: z.number().int().min(1).max(3650).optional(),
        renewGrantDays: z.number().int().min(1).max(3650).optional(),
        payEnabled: z.boolean().optional(),
        payAddress: z.string().max(64).optional(),
        orderTtlMinutes: z.number().int().min(5).max(240).optional(),
      })
      .parse(req.body);

    const cur = await getMemberBillingSettings();
    const payAddress = (body.payAddress !== undefined ? body.payAddress : cur.payAddress).trim();
    const payEnabled = body.payEnabled ?? cur.payEnabled;
    if (payEnabled && !payAddress) {
      return reply.code(400).send({ error: "开启链上购买前请填写 USDT 收款地址" });
    }
    if (payAddress && !(await isValidTronAddress(payAddress))) {
      return reply.code(400).send({ error: "USDT 收款地址无效" });
    }

    const saved = await saveMemberBillingSettings({ ...body, payAddress, payEnabled });
    await prisma.auditLog.create({
      data: {
        userId: u.sub,
        action: "MEMBER_BILLING_SAVE",
        detail: j(saved),
      },
    });
    return saved;
  });

  app.get("/api/admin/member-codes", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    const rows = await listMemberRegisterCodes();
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      kind: r.kind,
      grantDays: r.grantDays,
      priceUsdt: r.priceUsdt,
      codeExpiresAt: r.codeExpiresAt?.toISOString() ?? null,
      usedAt: r.usedAt?.toISOString() ?? null,
      usedBy: r.usedBy
        ? { id: r.usedBy.id, username: r.usedBy.username, displayName: r.usedBy.displayName }
        : null,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  app.post("/api/admin/member-codes", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
    if (!(await assertFullAccess(reply))) return;
    const body = z
      .object({
        count: z.number().int().min(1).max(100).default(1),
        grantDays: z.number().int().min(1).max(3650).optional(),
        codeExpiresInDays: z.number().int().min(1).max(365).optional(),
      })
      .parse(req.body);
    const rows = await generateMemberRegisterCodes({
      count: body.count,
      grantDays: body.grantDays,
      codeExpiresInDays: body.codeExpiresInDays,
      createdById: u.sub,
    });
    await prisma.auditLog.create({
      data: {
        userId: u.sub,
        action: "MEMBER_CODES_GENERATED",
        detail: j({ count: rows.length, codes: rows.map((x) => x.code) }),
      },
    });
    return {
      codes: rows.map((r) => ({
        id: r.id,
        code: r.code,
        grantDays: r.grantDays,
        codeExpiresAt: r.codeExpiresAt?.toISOString() ?? null,
      })),
    };
  });

  app.post(
    "/api/admin/members/:id/extend",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const u = getUser(req);
      requireRoles(u, [Role.SUPER_ADMIN]);
      if (!(await assertFullAccess(reply))) return;
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const body = z.object({ days: z.number().int().min(1).max(3650) }).parse(req.body);
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target || target.role !== Role.MEMBER) {
        return reply.code(404).send({ error: "会员不存在" });
      }
      const memberExpiresAt = extendMemberExpiry(target.memberExpiresAt, body.days);
      const updated = await prisma.user.update({
        where: { id },
        data: { memberExpiresAt },
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          active: true,
          memberCode: true,
          memberExpiresAt: true,
          createdAt: true,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: u.sub,
          action: "MEMBER_EXTEND",
          detail: j({
            targetUserId: id,
            days: body.days,
            memberExpiresAt: memberExpiresAt.toISOString(),
          }),
        },
      });
      return {
        ...updated,
        memberExpiresAt: updated.memberExpiresAt?.toISOString() ?? null,
        subscriptionActive: memberSubscriptionActive(updated),
      };
    }
  );

  app.post("/api/public/member/orders", async (req, reply) => {
    const body = z.object({ type: z.enum(["REGISTER", "RENEW"]) }).parse(req.body);
    let userId: string | undefined;
    if (body.type === "RENEW") {
      try {
        await req.jwtVerify();
        const u = getUser(req);
        if (u.role !== Role.MEMBER) {
          return reply.code(403).send({ error: "仅会员可购买月卡" });
        }
        userId = u.sub;
      } catch {
        return reply.code(401).send({ error: "请先登录会员账号" });
      }
    }
    try {
      const order = await createMemberPayOrder({ type: body.type, userId });
      void scanPendingMemberPayments();
      return { ok: true, order: serializeMemberOrder(order) };
    } catch (e) {
      const message = e instanceof Error ? e.message : "create_order_failed";
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 500;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.get("/api/public/member/orders/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    void scanPendingMemberPayments();
    const order = await getMemberPayOrder(id);
    if (!order) return reply.code(404).send({ error: "订单不存在" });
    if (order.status === "PENDING" && order.expiresAt <= new Date()) {
      const expired = await prisma.memberPayOrder.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
        include: { registerCode: { select: { code: true } } },
      });
      return { ok: true, order: serializeMemberOrder(expired) };
    }
    const fresh = await getMemberPayOrder(id);
    return { ok: true, order: serializeMemberOrder(fresh!) };
  });

  app.get("/api/public/member/billing-meta", async () => {
    const s = await getMemberBillingSettings();
    return {
      mode: s.mode as MemberRegisterMode,
      registerOpen: s.mode !== "off",
      requireRegisterCode: s.mode === "code_required",
      regPriceUsdt: s.regPriceUsdt,
      renewPriceUsdt: s.renewPriceUsdt,
      regGrantDays: s.regGrantDays,
      renewGrantDays: s.renewGrantDays,
      payEnabled: s.payEnabled,
    };
  });
}
