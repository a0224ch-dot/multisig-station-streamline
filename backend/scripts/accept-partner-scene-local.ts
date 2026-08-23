/**
 * 本地 DB 验收友商柜台 listScenarioCards 逻辑（无需演示站登录）
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { listScenarioCards } from "../src/scenarios.js";
import { Role } from "../src/types.js";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;

function ok(m: string) {
  console.log(`PASS  ${m}`);
  pass++;
}
function bad(m: string) {
  console.log(`FAIL  ${m}`);
  fail++;
}

async function main() {
  console.log("==========================================");
  console.log(" 友商柜台 · 本地 listScenarioCards 验收");
  console.log("==========================================");

  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    bad("缺少 admin 用户，请先 seed");
    process.exit(1);
  }

  let member = await prisma.user.findFirst({
    where: { role: Role.MEMBER, memberCode: { not: null } },
  });
  if (!member) {
    const passwordHash = await bcrypt.hash("Accept@123456", 10);
    member = await prisma.user.create({
      data: {
        username: `accept_local_${Date.now().toString(36)}`,
        passwordHash,
        displayName: "验收会员",
        role: Role.MEMBER,
        memberCode: `t${Date.now().toString(36).slice(-7)}`,
        memberExpiresAt: new Date(Date.now() + 7 * 864e5),
      },
    });
    ok(`创建测试会员 memberCode=${member.memberCode}`);
  } else {
    ok(`使用已有会员 ${member.username} code=${member.memberCode}`);
  }

  const adminView = await listScenarioCards({
    includeDisabled: true,
    viewer: { sub: admin.id, role: Role.SUPER_ADMIN },
  });
  const adminKeys = adminView.scenarios.map((s) => s.builtinKey);
  if (!adminKeys.includes("partner-counter")) ok("admin 列表不含 partner-counter");
  else bad("admin 不应看到 partner-counter");
  if (adminKeys.includes("counter-open")) ok("admin 可见 counter-open");

  const memView = await listScenarioCards({
    includeDisabled: true,
    viewer: { sub: member!.id, role: Role.MEMBER },
  });
  const partner = memView.scenarios.find((s) => s.builtinKey === "partner-counter");
  if (partner?.title === "友商柜台") ok("会员可见「友商柜台」");
  else bad(`会员未见友商柜台: ${memView.scenarios.map((s) => s.builtinKey).join(",")}`);

  if (partner) {
    if (partner.refPrefix === "partner") ok("refPrefix=partner");
    else bad(`refPrefix=${partner.refPrefix}`);
    if (partner.templateHint?.includes("streamline-partner-scene")) {
      ok("templateHint 正确");
    } else bad(`templateHint=${partner.templateHint}`);
    const code = member!.memberCode!;
    if (partner.entryUrl.includes(`/p/u/${code}`) && partner.entryUrl.includes("ref=partner")) {
      ok(`entryUrl=${partner.entryUrl}`);
    } else bad(`entryUrl 异常: ${partner.entryUrl}`);
    const img = partner.images[0]?.url || "";
    if (img.includes("partner-counter.svg")) ok("封面 partner-counter.svg");
    else bad(`封面=${img}`);
  }

  console.log("------------------------------------------");
  console.log(` PASS=${pass}  FAIL=${fail}`);
  console.log("------------------------------------------");
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
