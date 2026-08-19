import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerOpenRoutes } from "./routes/open.js";
import { registerUpdateRoutes } from "./routes/update.js";
import { registerPageDecorRoutes } from "./routes/pageDecor.js";
import { registerScenarioRoutes } from "./routes/scenarios.js";
import { registerMemberBillingRoutes } from "./routes/memberBilling.js";
import { startHqSync } from "./hqSync.js";
import { startMemberPaymentMonitor } from "./memberPayment.js";
import { Role } from "./types.js";
import { memberSubscriptionActive } from "./memberBilling.js";
import { finalizeUpdateOnBoot } from "./update/boot.js";
import { readLocalVersion } from "./update/paths.js";
import { ensureUploadDirs } from "./pageDecor.js";
import { prisma } from "./db.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      req: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply
    ) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; username: string; role: string };
    user: { sub: string; username: string; role: string };
  }
}

async function main() {
  const app = Fastify({ logger: true, trustProxy: true });

  await app.register(cors, { origin: process.env.FRONTEND_ORIGIN || true });
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "streamline-dev-secret",
  });
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  });
  ensureUploadDirs();

  app.decorate("authenticate", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const sub = (req.user as { sub?: string } | undefined)?.sub;
    if (!sub) return reply.code(401).send({ error: "Unauthorized" });
    const row = await prisma.user.findUnique({
      where: { id: sub },
      select: { active: true, role: true, memberExpiresAt: true },
    });
    if (!row?.active) {
      return reply.code(401).send({ error: "账号已停用" });
    }
    if (row.role === Role.MEMBER && !memberSubscriptionActive(row)) {
      return reply.code(403).send({ error: "会员权限已过期，请购买月卡续费" });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    const statusCode =
      "statusCode" in err && typeof err.statusCode === "number" ? err.statusCode : 500;
    if (statusCode >= 500) app.log.error(err);
    reply.code(statusCode).send({ error: err.message || "error" });
  });

  app.get("/api/health", async () => ({
    ok: true,
    edition: "streamline",
    version: readLocalVersion(),
    hq: process.env.HQ_BASE_URL || "",
  }));

  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
  await registerOpenRoutes(app);
  await registerUpdateRoutes(app);
  await registerPageDecorRoutes(app);
  await registerScenarioRoutes(app);
  await registerMemberBillingRoutes(app);

  const port = Number(process.env.PORT || 8791);
  await app.listen({ port, host: "0.0.0.0" });
  finalizeUpdateOnBoot();
  startHqSync();
  startMemberPaymentMonitor();
  app.log.info(`streamline api on :${port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
