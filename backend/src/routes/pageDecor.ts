import type { FastifyInstance } from "fastify";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { Role } from "../types.js";
import { getUser, requireRoles } from "../auth.js";
import { prisma } from "../db.js";
import { j } from "../json.js";
import {
  detectImageExt,
  ensureUploadDirs,
  getPageDecor,
  isSafeUploadName,
  pageDecorUploadDir,
  savePageDecor,
  emptyPageDecor,
} from "../pageDecor.js";
import {
  getLandingInfo,
  isValidLandingSlug,
  setLandingSlug,
} from "../landing.js";
import { z } from "zod";

const MAX_BYTES = 2 * 1024 * 1024;

export async function registerPageDecorRoutes(app: FastifyInstance) {
  ensureUploadDirs();

  app.get("/api/admin/page-decor", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    return getPageDecor();
  });

  app.get("/api/admin/landing", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    return getLandingInfo();
  });

  app.put("/api/admin/landing", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    const body = z.object({ slug: z.string().min(1).max(64) }).parse(req.body);
    if (!isValidLandingSlug(body.slug.trim().toLowerCase())) {
      return reply
        .code(400)
        .send({ error: "入口路径仅允许小写字母、数字、连字符，长度 2～32" });
    }
    try {
      const slug = await setLandingSlug(body.slug);
      await prisma.auditLog.create({
        data: { userId: u.sub, action: "LANDING_SLUG_UPDATE", detail: j({ slug }) },
      });
      return getLandingInfo();
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败";
      return reply.code(400).send({ error: message });
    }
  });

  app.put("/api/admin/page-decor", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    const saved = await savePageDecor(req.body);
    await prisma.auditLog.create({
      data: { userId: u.sub, action: "PAGE_DECOR_UPDATE", detail: j({ images: saved.images.length }) },
    });
    return saved;
  });

  app.post("/api/admin/page-decor/reset", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    const saved = await savePageDecor(emptyPageDecor());
    await prisma.auditLog.create({
      data: { userId: u.sub, action: "PAGE_DECOR_RESET", detail: j({}) },
    });
    return saved;
  });

  app.post("/api/admin/page-decor/upload", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);

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

    ensureUploadDirs();
    const id = randomBytes(8).toString("hex");
    const name = `${id}.${ext}`;
    const dest = path.join(pageDecorUploadDir(), name);
    fs.writeFileSync(dest, buf);

    return {
      id,
      url: `/api/media/page-decor/${name}`,
      link: "",
    };
  });

  /** 公网可读媒体（仅白名单文件名） */
  app.get("/api/media/page-decor/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!isSafeUploadName(file)) {
      return reply.code(400).send({ error: "invalid" });
    }
    const full = path.join(pageDecorUploadDir(), file);
    if (!full.startsWith(pageDecorUploadDir()) || !fs.existsSync(full)) {
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
}
