import type { FastifyInstance } from "fastify";
import { Role } from "../types.js";
import { getUser, requireRoles } from "../auth.js";
import { readLocalVersion } from "../update/paths.js";
import {
  isBusyPhase,
  readUpdateStatus,
  writeUpdateStatus,
} from "../update/status.js";
import { checkForUpdate, spawnUpdateRunner } from "../update/apply.js";
import { isNewer } from "../update/version.js";
import { assertFullAccess } from "../license.js";

export async function registerUpdateRoutes(app: FastifyInstance) {
  app.get("/api/admin/update/status", { preHandler: [app.authenticate] }, async (req) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    const status = readUpdateStatus();
    return {
      ...status,
      currentVersion: readLocalVersion(),
    };
  });

  app.post("/api/admin/update/check", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    if (!(await assertFullAccess(reply))) return;
    const cur = readUpdateStatus();
    if (isBusyPhase(cur.phase)) {
      return { ...cur, error: "更新进行中，请稍候" };
    }
    return checkForUpdate();
  });

  app.post("/api/admin/update/apply", { preHandler: [app.authenticate] }, async (req, reply) => {
    const u = getUser(req);
    requireRoles(u, [Role.SUPER_ADMIN, Role.EMPLOYEE]);
    if (!(await assertFullAccess(reply))) return;
    const cur = readUpdateStatus();
    if (isBusyPhase(cur.phase)) {
      return reply.code(409).send({ error: "已有更新任务在进行中" });
    }
    if (!cur.latest?.zipUrl || !cur.latest.sha256) {
      return reply.code(400).send({ error: "请先点击「检查更新」" });
    }
    if (!isNewer(cur.latest.version, readLocalVersion())) {
      return reply.code(400).send({ error: "当前已是最新版本，无需更新" });
    }

    writeUpdateStatus({
      phase: "queued",
      targetVersion: cur.latest.version,
      message: "已排队，即将开始下载…",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      logs: [`准备更新到 ${cur.latest.version}`],
    });

    spawnUpdateRunner();

    return {
      ok: true,
      message: "更新已开始，请稍候自动刷新状态",
      status: readUpdateStatus(),
    };
  });
}
