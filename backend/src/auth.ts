import type { FastifyRequest } from "fastify";
import type { Role } from "./types.js";

export type JwtUser = {
  sub: string;
  username: string;
  role: Role;
};

export function getUser(req: FastifyRequest): JwtUser {
  const u = req.user as JwtUser | undefined;
  if (!u?.sub) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return u;
}

export function requireRoles(user: JwtUser, roles: Role[]) {
  if (!roles.includes(user.role)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
}
