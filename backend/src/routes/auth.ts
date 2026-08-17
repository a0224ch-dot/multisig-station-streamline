import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "../types.js";
import { prisma } from "../db.js";
import { getUser } from "../auth.js";
import { j } from "../json.js";
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
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
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
    if (!user || !user.active || user.role === Role.MEMBER) {
      recordLoginFailure(ip, body.username);
      return reply.code(401).send({ error: "用户名或密码错误" });
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      recordLoginFailure(ip, body.username);
      return reply.code(401).send({ error: "用户名或密码错误" });
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

  app.get("/api/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    return publicUser(user);
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
}
