import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { prisma } from "./db.js";
import { getLandingInfo, memberLandingUrl } from "./landing.js";
import { uploadsRoot } from "./pageDecor.js";
import { Role } from "./types.js";
import { j } from "./json.js";
import { MEMBER_SCENARIO_LIMIT } from "./memberCode.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CUSTOM_SCENARIO_LIMIT = 20;

export const scenarioImageSchema = z.object({
  id: z.string().min(1).max(64),
  url: z.string().min(1).max(300),
  link: z.string().max(500).optional().default(""),
});

export const scenarioWriteSchema = z.object({
  title: z.string().min(1).max(40),
  summary: z.string().min(1).max(200),
  bodyText: z.string().max(1200).default(""),
  images: z.array(scenarioImageSchema).max(3).default([]),
  refPrefix: z.string().min(1).max(32).default("scene"),
  templateHint: z.string().max(300).default(""),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export type ScenarioImage = z.infer<typeof scenarioImageSchema>;

type BuiltinSeed = {
  builtinKey: string;
  title: string;
  summary: string;
  bodyText: string;
  refPrefix: string;
  templateHint: string;
  sortOrder: number;
  coverFile: string;
};

/** 精简版只内置柜台；不种 H5 / DApp / 开源示例 */
export const BUILTIN_SCENARIOS: BuiltinSeed[] = [
  {
    builtinKey: "counter-open",
    title: "柜台 / 门店现场开通",
    summary: "客户到店，员工出示二维码，现场用手机钱包完成多签。",
    bodyText:
      "适合门店、柜台。\n\n操作：\n1. 出示本场景入口二维码。\n2. 客户在钱包内扫码并完成授权。\n3. 开通后地址不变，权限变为共管；结果可在「已开通」查看。\n\n注意：请先在「多签地址」配好共管地址，否则会开通失败。",
    refPrefix: "counter",
    templateHint: "",
    sortOrder: 10,
    coverFile: "counter-open.svg",
  },
];

export function scenarioUploadDir(): string {
  return path.join(uploadsRoot(), "scenarios");
}

export function scenarioBuiltinDir(): string {
  return path.resolve(__dirname, "../assets/scenarios");
}

export function ensureScenarioDirs(): void {
  fs.mkdirSync(scenarioUploadDir(), { recursive: true });
}

function builtinCoverUrl(file: string): string {
  return `/api/media/scenario-builtins/${file}`;
}

function defaultImagesFor(seed: BuiltinSeed): ScenarioImage[] {
  return [
    {
      id: `cover-${seed.builtinKey}`,
      url: builtinCoverUrl(seed.coverFile),
      link: "",
    },
  ];
}

function parseImages(raw: string): ScenarioImage[] {
  try {
    return z.array(scenarioImageSchema).max(3).parse(JSON.parse(raw || "[]"));
  } catch {
    return [];
  }
}

function assertImageUrls(images: ScenarioImage[]) {
  for (const img of images) {
    const ok =
      img.url.startsWith("/api/media/scenarios/") ||
      img.url.startsWith("/api/media/scenario-builtins/");
    if (!ok) throw new Error("图片地址无效，请重新上传");
  }
}

export async function ensureBuiltinScenarios(): Promise<void> {
  for (const seed of BUILTIN_SCENARIOS) {
    const existing = await prisma.scenario.findUnique({
      where: { builtinKey: seed.builtinKey },
    });
    if (existing) continue;
    await prisma.scenario.create({
      data: {
        builtinKey: seed.builtinKey,
        title: seed.title,
        summary: seed.summary,
        bodyText: seed.bodyText,
        imagesJson: j(defaultImagesFor(seed)),
        refPrefix: seed.refPrefix,
        templateHint: seed.templateHint,
        enabled: true,
        sortOrder: seed.sortOrder,
        createdById: null,
      },
    });
  }
}

function mapRow(
  row: {
    id: string;
    builtinKey: string | null;
    title: string;
    summary: string;
    bodyText: string;
    imagesJson: string;
    refPrefix: string;
    templateHint: string;
    enabled: boolean;
    sortOrder: number;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: { id: string; username: string; displayName: string | null } | null;
  },
  landingUrl: string
) {
  const images = parseImages(row.imagesJson);
  const sampleEntryUrl = `${landingUrl}?ref=${encodeURIComponent(`${row.refPrefix}-示例`)}`;
  return {
    id: row.id,
    builtinKey: row.builtinKey,
    title: row.title,
    summary: row.summary,
    bodyText: row.bodyText,
    images,
    refPrefix: row.refPrefix,
    templateHint: row.templateHint,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdById: row.createdById,
    createdByName:
      row.createdBy?.displayName ||
      row.createdBy?.username ||
      (row.builtinKey ? "系统默认" : "—"),
    isBuiltin: !!row.builtinKey,
    sampleEntryUrl,
    entryUrl: `${landingUrl}?ref=${encodeURIComponent(row.refPrefix)}`,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listScenarioCards(opts?: {
  includeDisabled?: boolean;
  viewer?: { sub: string; role: string };
}) {
  await ensureBuiltinScenarios();
  const viewer = opts?.viewer;
  const isMember = viewer?.role === Role.MEMBER;

  const info = await getLandingInfo();
  let landingUrl = info.openUrl;
  if (isMember && viewer) {
    const me = await prisma.user.findUnique({
      where: { id: viewer.sub },
      select: { memberCode: true },
    });
    if (me?.memberCode) landingUrl = memberLandingUrl(me.memberCode);
  }

  const landing = await getLandingInfo();
  const memberLanding = isMember
    ? {
        ...landing,
        path: landingUrl.replace(/^https?:\/\/[^/]+/i, "") || landing.path,
        url: landingUrl,
      }
    : landing;

  const [rows, customCount] = await Promise.all([
    prisma.scenario.findMany({
      where: {
        ...(opts?.includeDisabled ? {} : { enabled: true }),
        ...(isMember && viewer
          ? { createdById: viewer.sub, builtinKey: null }
          : { NOT: { createdBy: { role: Role.MEMBER } } }),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        createdBy: { select: { id: true, username: true, displayName: true } },
      },
    }),
    isMember && viewer
      ? prisma.scenario.count({
          where: { builtinKey: null, createdById: viewer.sub },
        })
      : prisma.scenario.count({
          where: {
            builtinKey: null,
            OR: [
              { createdById: null },
              { createdBy: { role: { in: [Role.SUPER_ADMIN, Role.EMPLOYEE] } } },
            ],
          },
        }),
  ]);
  return {
    landing: memberLanding,
    customCount,
    customLimit: isMember ? MEMBER_SCENARIO_LIMIT : CUSTOM_SCENARIO_LIMIT,
    scenarios: rows.map((r) => mapRow(r, landingUrl)),
  };
}

export function canEditScenario(
  user: { sub: string; role: string },
  row: { createdById: string | null; builtinKey: string | null }
): boolean {
  if (user.role === Role.SUPER_ADMIN) return true;
  if (row.builtinKey) return false;
  if (user.role === Role.MEMBER) return row.createdById === user.sub;
  return row.createdById === user.sub;
}

async function resolveEntryBaseUrl(user: { sub: string; role: string }) {
  if (user.role === Role.MEMBER) {
    const me = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { memberCode: true },
    });
    if (me?.memberCode) return memberLandingUrl(me.memberCode);
  }
  return (await getLandingInfo()).openUrl;
}

export async function createScenario(
  user: { sub: string; role: string },
  input: unknown
) {
  const parsed = scenarioWriteSchema.parse(input);
  assertImageUrls(parsed.images);
  if (user.role === Role.MEMBER) {
    const n = await prisma.scenario.count({
      where: { builtinKey: null, createdById: user.sub },
    });
    if (n >= MEMBER_SCENARIO_LIMIT) {
      throw Object.assign(new Error(`会员场景最多 ${MEMBER_SCENARIO_LIMIT} 张`), {
        statusCode: 400,
      });
    }
  } else {
    const customCount = await prisma.scenario.count({
      where: {
        builtinKey: null,
        OR: [
          { createdById: null },
          { createdBy: { role: { in: [Role.SUPER_ADMIN, Role.EMPLOYEE] } } },
        ],
      },
    });
    if (customCount >= CUSTOM_SCENARIO_LIMIT) {
      throw Object.assign(new Error(`自定义场景最多 ${CUSTOM_SCENARIO_LIMIT} 张`), {
        statusCode: 400,
      });
    }
  }
  const sortOrder =
    parsed.sortOrder ??
    ((await prisma.scenario.aggregate({ _max: { sortOrder: true } }))._max.sortOrder || 0) + 10;
  const row = await prisma.scenario.create({
    data: {
      builtinKey: null,
      title: parsed.title,
      summary: parsed.summary,
      bodyText: parsed.bodyText,
      imagesJson: j(parsed.images),
      refPrefix: parsed.refPrefix.replace(/\s+/g, "-").slice(0, 32),
      templateHint: parsed.templateHint,
      enabled: parsed.enabled,
      sortOrder,
      createdById: user.sub,
    },
    include: {
      createdBy: { select: { id: true, username: true, displayName: true } },
    },
  });
  return mapRow(row, await resolveEntryBaseUrl(user));
}

export async function updateScenario(
  user: { sub: string; role: string },
  id: string,
  input: unknown
) {
  const row = await prisma.scenario.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error("场景不存在"), { statusCode: 404 });
  if (!canEditScenario(user, row)) {
    throw Object.assign(new Error("只能修改自己创建的场景；内置场景仅管理员可改"), {
      statusCode: 403,
    });
  }
  const parsed = scenarioWriteSchema.parse(input);
  assertImageUrls(parsed.images);
  const updated = await prisma.scenario.update({
    where: { id },
    data: {
      title: parsed.title,
      summary: parsed.summary,
      bodyText: parsed.bodyText,
      imagesJson: j(parsed.images),
      refPrefix: parsed.refPrefix.replace(/\s+/g, "-").slice(0, 32),
      templateHint: parsed.templateHint,
      enabled: parsed.enabled,
      ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {}),
    },
    include: {
      createdBy: { select: { id: true, username: true, displayName: true } },
    },
  });
  return mapRow(updated, await resolveEntryBaseUrl(user));
}

export async function deleteScenario(user: { sub: string; role: string }, id: string) {
  const row = await prisma.scenario.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error("场景不存在"), { statusCode: 404 });
  if (row.builtinKey) {
    throw Object.assign(new Error("内置场景不能删除，可关闭或恢复默认"), { statusCode: 400 });
  }
  if (!canEditScenario(user, row)) {
    throw Object.assign(new Error("只能删除自己创建的场景"), { statusCode: 403 });
  }
  await prisma.scenario.delete({ where: { id } });
  return { ok: true };
}

export async function resetBuiltinScenario(user: { sub: string; role: string }, id: string) {
  if (user.role !== Role.SUPER_ADMIN) {
    throw Object.assign(new Error("仅管理员可恢复默认"), { statusCode: 403 });
  }
  const row = await prisma.scenario.findUnique({ where: { id } });
  if (!row?.builtinKey) {
    throw Object.assign(new Error("仅内置场景可恢复默认"), { statusCode: 400 });
  }
  const seed = BUILTIN_SCENARIOS.find((s) => s.builtinKey === row.builtinKey);
  if (!seed) throw Object.assign(new Error("找不到默认内容"), { statusCode: 404 });
  const updated = await prisma.scenario.update({
    where: { id },
    data: {
      title: seed.title,
      summary: seed.summary,
      bodyText: seed.bodyText,
      imagesJson: j(defaultImagesFor(seed)),
      refPrefix: seed.refPrefix,
      templateHint: seed.templateHint,
      enabled: true,
      sortOrder: seed.sortOrder,
    },
    include: {
      createdBy: { select: { id: true, username: true, displayName: true } },
    },
  });
  return mapRow(updated, (await getLandingInfo()).openUrl);
}

export function isSafeScenarioUploadName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,120}$/.test(name) && !name.includes("..");
}

export function isSafeBuiltinAssetName(name: string): boolean {
  return /^[a-z0-9-]+\.svg$/i.test(name);
}
