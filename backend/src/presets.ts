import { BRANCH_PRESET_OWNER } from "./types.js";
import { prisma } from "./db.js";
import { getNetwork } from "./config.js";
import { isValidTronAddress } from "./tron.js";

export function normalizePresetOwnerId(ownerUserId?: string | null): string {
  const raw = (ownerUserId || "").trim();
  if (!raw || raw === BRANCH_PRESET_OWNER) return BRANCH_PRESET_OWNER;
  return raw;
}

export async function listLowPresets(ownerUserId?: string | null) {
  const network = await getNetwork();
  const owner = normalizePresetOwnerId(ownerUserId);
  return prisma.presetSigner.findMany({
    where: { network, group: "LOW", ownerUserId: owner, active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function saveLowPresets(
  ownerUserId: string | null | undefined,
  signers: { address: string; name: string }[]
) {
  const network = await getNetwork();
  const owner = normalizePresetOwnerId(ownerUserId);
  for (const s of signers) {
    if (!(await isValidTronAddress(s.address))) {
      throw Object.assign(
        new Error(`地址无效（校验位不通过）：${s.address}`),
        { statusCode: 400 }
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.presetSigner.updateMany({
      where: { network, group: "LOW", ownerUserId: owner },
      data: { active: false },
    });
    let i = 0;
    for (const s of signers) {
      i += 1;
      await tx.presetSigner.upsert({
        where: {
          network_group_ownerUserId_address: {
            network,
            group: "LOW",
            ownerUserId: owner,
            address: s.address,
          },
        },
        update: { name: s.name, sortOrder: i, active: true },
        create: {
          network,
          group: "LOW",
          ownerUserId: owner,
          address: s.address,
          name: s.name,
          sortOrder: i,
          active: true,
        },
      });
    }
  });

  return listLowPresets(owner);
}
