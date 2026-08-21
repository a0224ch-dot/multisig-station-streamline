import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "../types.js";
import { prisma } from "../db.js";
import { getUser, requireRoles } from "../auth.js";
import { j } from "../json.js";
import { publicOrigin } from "../landing.js";
import { assertFullAccess } from "../license.js";
import {
  allocateMemberCode,
  isMemberRegisterEnabled,
} from "../memberCode.js";
import {
  extendMemberExpiry,
  getMemberBillingSettings,
  matchUniversalRegisterCode,
  memberSubscriptionActive,
  saveMemberBillingSettings,
} from "../memberBilling.js";
import { consumeRegisterCode } from "../memberRegisterCode.js";
import {
  checkLoginAllowed,
  clearLoginFailures,
  clientIp,
  consumeCaptcha,
  createCaptcha,
  recordLoginFailure,
} from "../loginGuard.js";

function publicUser(user: {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  active?: boolean;
  memberCode?: string | null;
  memberExpiresAt?: Date | null;
}) {
  const active = user.active !== false;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    memberCode: user.memberCode || null,
    memberEntryUrl: user.memberCode
      ? `${publicOrigin()}/p/u/${user.memberCode}`
      : null,
    memberExpiresAt: user.memberExpiresAt?.toISOString() ?? null,
    subscriptionActive: memberSubscriptionActive({
      role: user.role,
      active,
      memberExpiresAt: user.memberExpiresAt ?? null,
    }),
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/captcha", async () => {
    const c = createCaptcha();
    return {
      captchaId: c.id,
      imageSvg: c.imageSvg,
      expiresInSec: c.expiresInSec,
    };
  });

  app.post("/api/auth/member/register", async (req, reply) => {
    const billing = await getMemberBillingSettings();
    if (billing.mode === "off") {
      return reply.code(403).send({ error: "未开放会员注册，请联系本站管理员" });
    }
    if (!(await assertFullAccess(reply))) return;
    const body = z
      .object({
        username: z.string().min(2).max(32),
        password: z.string().min(6).max(72),
        displayName: z.string().max(64).optional(),
        captchaId: z.string().min(8),
        captchaCode: z.string().min(1).max(8),
        registerCode: z.string().max(32).optional(),
      })
      .parse(req.body);

    if (billing.mode === "code_required") {
      const code = (body.registerCode || "").trim();
      if (!code) {
        return reply.code(400).send({ error: "请填写注册码" });
      }
    }

    const ip = clientIp(req);
    if (!consumeCaptcha(body.captchaId, body.captchaCode)) {
      return reply.code(400).send({ error: "验证码错误或已过期，请刷新后重试" });
    }

    const username = body.username.trim();
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5.-]{2,32}$/.test(username)) {
      return reply.code(400).send({ error: "用户名仅支持字母、数字、下划线、中文等" });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const memberCode = await allocateMemberCode();

    try {
      const user = await prisma.$transaction(async (tx) => {
        if (billing.mode === "code_required") {
          const codeInput = body.registerCode!.trim();
          const uni = matchUniversalRegisterCode(billing, codeInput);
          if (uni.matched) {
            const created = await tx.user.create({
              data: {
                username,
                passwordHash,
                displayName: body.displayName?.trim() || username,
                role: Role.MEMBER,
                memberCode,
                memberExpiresAt: extendMemberExpiry(null, uni.grantDays),
              },
            });
            await tx.auditLog.create({
              data: {
                userId: created.id,
                action: "MEMBER_REGISTER_UNIVERSAL_CODE",
                detail: j({ grantDays: uni.grantDays }),
              },
            });
            return created;
          }
          const codeRow = await consumeRegisterCode(codeInput, tx);
          const created = await tx.user.create({
            data: {
              username,
              passwordHash,
              displayName: body.displayName?.trim() || username,
              role: Role.MEMBER,
              memberCode,
              memberExpiresAt: extendMemberExpiry(null, codeRow.grantDays),
            },
          });
          await tx.memberRegisterCode.update({
            where: { id: codeRow.id },
            data: { usedAt: new Date(), usedById: created.id },
          });
          await tx.auditLog.create({
            data: {
              userId: created.id,
              action: "MEMBER_REGISTER_CODE_USED",
              detail: j({ code: codeRow.code, grantDays: codeRow.grantDays }),
            },
          });
          return created;
        }
        return tx.user.create({
          data: {
            username,
            passwordHash,
            displayName: body.displayName?.trim() || username,
            role: Role.MEMBER,
            memberCode,
            memberExpiresAt: null,
          },
        });
      });
      const token = app.jwt.sign({
        sub: user.id,
        username: user.username,
        role: user.role,
      });
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "MEMBER_REGISTER",
          detail: j({ username: user.username, memberCode, ip }),
        },
      });
      return { token, user: publicUser(user) };
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      if (err.statusCode === 400 && err.message) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(400).send({ error: "用户名已存在" });
    }
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = z
      .object({
        username: z.string().min(1),
        password: z.string().min(1),
        captchaId: z.string().min(8),
        captchaCode: z.string().min(1).max(8),
      })
      .parse(req.body);

    const ip = clientIp(req);
    const gate = checkLoginAllowed(ip, body.username);
    if (!gate.ok) {
      return reply.code(429).send({ error: gate.error });
    }

    if (!consumeCaptcha(body.captchaId, body.captchaCode)) {
      recordLoginFailure(ip, body.username);
      return reply.code(400).send({ error: "验证码错误或已过期，请刷新后重试" });
    }

    const user = await prisma.user.findUnique({ where: { username: body.username } });
    if (!user || !user.active) {
      recordLoginFailure(ip, body.username);
      return reply.code(401).send({ error: "用户名或密码错误" });
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      recordLoginFailure(ip, body.username);
      return reply.code(401).send({ error: "用户名或密码错误" });
    }

    if (user.role === Role.MEMBER && !memberSubscriptionActive(user)) {
      return reply.code(403).send({ error: "会员权限已过期，请购买月卡续费" });
    }

    clearLoginFailures(ip, body.username);

    const token = app.jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "LOGIN", detail: j({ username: user.username }) },
    });
    return { token, user: publicUser(user) };
  });

  app.get("/api/auth/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    if (user.role === Role.MEMBER && !memberSubscriptionActive(user)) {
      return reply.code(403).send({ error: "会员权限已过期，请购买月卡续费" });
    }
    return publicUser(user);
  });

  app.post("/api/auth/display-name", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    const body = z.object({ displayName: z.string().min(1).max(40) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    if (!user.active) return reply.code(401).send({ error: "账号已停用" });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { displayName: body.displayName.trim() },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DISPLAY_NAME_CHANGE",
        detail: j({ from: user.displayName, to: updated.displayName }),
      },
    });
    return publicUser(updated);
  });

  app.post("/api/auth/change-password", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    const body = z
      .object({
        oldPassword: z.string().min(1),
        newPassword: z.string().min(6, "新密码至少 6 位").max(72),
      })
      .parse(req.body);

    if (body.oldPassword === body.newPassword) {
      return reply.code(400).send({ error: "新密码不能与旧密码相同" });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    if (!user.active) {
      return reply.code(401).send({ error: "账号已停用" });
    }
    const ok = await bcrypt.compare(body.oldPassword, user.passwordHash);
    if (!ok) {
      return reply.code(400).send({ error: "旧密码不正确" });
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_CHANGE",
        detail: j({ username: user.username, role: user.role }),
      },
    });

    return { ok: true };
  });

  app.get("/api/admin/member-register", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    const s = await getMemberBillingSettings();
    return {
      enabled: s.mode !== "off",
      mode: s.mode,
      requireRegisterCode: s.mode === "code_required",
    };
  });

  app.put("/api/admin/member-register", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
    if (!(await assertFullAccess(reply))) return;
    const body = z
      .object({
        enabled: z.boolean().optional(),
        mode: z.enum(["off", "open", "code_required"]).optional(),
      })
      .parse(req.body);
    let mode = body.mode;
    if (!mode && body.enabled !== undefined) {
      mode = body.enabled ? "open" : "off";
    }
    if (!mode) {
      return reply.code(400).send({ error: "请提供 mode 或 enabled" });
    }
    const saved = await saveMemberBillingSettings({ mode });
    await prisma.auditLog.create({
      data: {
        userId: u.sub,
        action: "MEMBER_REGISTER_TOGGLE",
        detail: j({ mode: saved.mode }),
      },
    });
    return {
      enabled: saved.mode !== "off",
      mode: saved.mode,
      requireRegisterCode: saved.mode === "code_required",
    };
  });

  app.get("/api/admin/members", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    return prisma.user.findMany({
      where: { role: Role.MEMBER },
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
      orderBy: { createdAt: "desc" },
      take: 500,
    }).then((rows) =>
      rows.map((r) => ({
        ...r,
        memberExpiresAt: r.memberExpiresAt?.toISOString() ?? null,
        subscriptionActive: memberSubscriptionActive(r),
      }))
    );
  });

  app.put("/api/admin/members/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN]);
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z.object({ active: z.boolean() }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.role !== Role.MEMBER) {
      return reply.code(404).send({ error: "会员不存在" });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { active: body.active },
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
        action: body.active ? "MEMBER_ENABLE" : "MEMBER_DISABLE",
        detail: j({ targetUserId: target.id, targetUsername: target.username }),
      },
    });
    return updated;
  });

  app.post(
    "/api/admin/users/:id/reset-password",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const u = getUser(req);
      requireRoles(u, [Role.SUPER_ADMIN]);
      if (!(await assertFullAccess(reply))) return;
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const body = z
        .object({ newPassword: z.string().min(6, "新密码至少 6 位").max(72) })
        .parse(req.body);
      if (id === u.sub) {
        return reply.code(400).send({ error: "请使用「修改密码」改自己的密码" });
      }
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target || target.role !== Role.MEMBER) {
        return reply.code(404).send({ error: "会员不存在" });
      }
      const passwordHash = await bcrypt.hash(body.newPassword, 10);
      await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });
      await prisma.auditLog.create({
        data: {
          userId: u.sub,
          action: "PASSWORD_RESET",
          detail: j({
            targetUserId: target.id,
            targetUsername: target.username,
            targetRole: target.role,
          }),
        },
      });
      return { ok: true };
    }
  );
}
