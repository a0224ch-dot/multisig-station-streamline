-- AlterTable User: 会员角色 + 专属短码
ALTER TABLE "User" ADD COLUMN "memberCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_memberCode_key" ON "User"("memberCode");

-- AlterTable PresetSigner: 按归属隔离（branch = 分公司默认）
ALTER TABLE "PresetSigner" ADD COLUMN "ownerUserId" TEXT NOT NULL DEFAULT 'branch';

DROP INDEX IF EXISTS "PresetSigner_network_group_address_key";

CREATE UNIQUE INDEX "PresetSigner_network_group_ownerUserId_address_key"
  ON "PresetSigner"("network", "group", "ownerUserId", "address");

CREATE INDEX "PresetSigner_network_group_ownerUserId_active_idx"
  ON "PresetSigner"("network", "group", "ownerUserId", "active");

-- AlterTable OpenSession: 开通会话绑定低档预置归属
ALTER TABLE "OpenSession" ADD COLUMN "presetOwnerId" TEXT;
