import type { FastifyInstance } from "fastify";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { Role } from "../types.js";
import { getUser, requireRoles } from "../auth.js";
import { prisma } from "../db.js";
import { j } from "../json.js";
import { assertFullAccess } from "../license.js";
import { assertMemberSubscription } from "../memberBilling.js";
import { detectImageExt, isSafeUploadName } from "../pageDecor.js";
import {
  createScenario,
  deleteScenario,
  ensureScenarioDirs,
  isSafeBuiltinAssetName,
  isSafeScenarioUploadName,
  listScenarioCards,
  resetBuiltinScenario,
  scenarioBuiltinDir,
  scenarioUploadDir,
  updateScenario,
} from "../scenarios.js";

const MAX_BYTES = 2 * 1024 * 1024;

export async function registerScenarioRoutes(app: FastifyInstance) {
  ensureScenarioDirs();

  app.get("/api/admin/scenarios", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE, Role.MEMBER]);
    return listScenarioCards({ includeDisabled: true, viewer: u });
  });

  app.post("/api/admin/scenarios", { preHandler: [app.authenticate] }, async (req, reply) => {
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
    try {
      const created = await createScenario(u, req.body);
      await prisma.auditLog.create({
        data: {
          userId: u.sub,
          action: "SCENARIO_CREATE",
          detail: j({ id: created.id, title: created.title }),
        },
      });
      return created;
    } catch (e) {
      const message = e instanceof Error ? e.message : "创建失败";
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.put("/api/admin/scenarios/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
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
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    try {
      const updated = await updateScenario(u, id, req.body);
      await prisma.auditLog.create({
        data: {
          userId: u.sub,
          action: "SCENARIO_UPDATE",
          detail: j({ id, title: updated.title }),
        },
      });
      return updated;
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败";
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.delete("/api/admin/scenarios/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
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
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    try {
      await deleteScenario(u, id);
      await prisma.auditLog.create({
        data: { userId: u.sub, action: "SCENARIO_DELETE", detail: j({ id }) },
      });
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "删除失败";
      const statusCode =
        typeof e === "object" && e && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.post(
    "/api/admin/scenarios/:id/reset",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const u = getUser(req);
      requireRoles(u, [Role.SUPER_ADMIN]);
      if (!(await assertFullAccess(reply))) return;
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      try {
        const row = await resetBuiltinScenario(u, id);
        await prisma.auditLog.create({
          data: {
            userId: u.sub,
            action: "SCENARIO_RESET",
            detail: j({ id, builtinKey: row.builtinKey }),
          },
        });
        return row;
      } catch (e) {
        const message = e instanceof Error ? e.message : "恢复失败";
        const statusCode =
          typeof e === "object" && e && "statusCode" in e
            ? Number((e as { statusCode: number }).statusCode)
            : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  app.post("/api/admin/scenarios/upload", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE, Role.MEMBER]);
    if (!(await assertFullAccess(reply))) return;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "请选择图片文件" });

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of file.file) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        return reply.code(400).send({ error: "图片不能超过 2MB" });
      }
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    const ext = detectImageExt(buf, file.mimetype);
    if (!ext) {
      return reply.code(400).send({ error: "仅支持 jpg / png / webp" });
    }

    ensureScenarioDirs();
    const id = randomBytes(8).toString("hex");
    const name = `${id}.${ext}`;
    if (!isSafeScenarioUploadName(name)) {
      return reply.code(400).send({ error: "文件名无效" });
    }
    fs.writeFileSync(path.join(scenarioUploadDir(), name), buf);
    return {
      id,
      url: `/api/media/scenarios/${name}`,
      link: "",
    };
  });

  app.get("/api/media/scenarios/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!isSafeUploadName(file) || !isSafeScenarioUploadName(file)) {
      return reply.code(400).send({ error: "invalid" });
    }
    const full = path.join(scenarioUploadDir(), file);
    if (!full.startsWith(scenarioUploadDir()) || !fs.existsSync(full)) {
      return reply.code(404).send({ error: "not_found" });
    }
    const ext = path.extname(file).toLowerCase();
    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.type(type).send(fs.createReadStream(full));
  });

  app.get("/api/media/scenario-builtins/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!isSafeBuiltinAssetName(file)) {
      return reply.code(400).send({ error: "invalid" });
    }
    const dir = scenarioBuiltinDir();
    const full = path.join(dir, file);
    if (!full.startsWith(dir) || !fs.existsSync(full)) {
      return reply.code(404).send({ error: "not_found" });
    }
    reply.header("Cache-Control", "public, max-age=604800");
    return reply.type("image/svg+xml").send(fs.createReadStream(full));
  });
}
