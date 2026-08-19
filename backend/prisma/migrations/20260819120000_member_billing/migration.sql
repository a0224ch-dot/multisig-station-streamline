-- AlterTable
ALTER TABLE "User" ADD COLUMN "memberExpiresAt" DATETIME;

-- CreateTable
CREATE TABLE "MemberRegisterCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "grantDays" INTEGER NOT NULL,
    "priceUsdt" REAL NOT NULL DEFAULT 0,
    "codeExpiresAt" DATETIME,
    "usedAt" DATETIME,
    "usedById" TEXT,
    "createdById" TEXT,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberRegisterCode_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MemberRegisterCode_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MemberPayOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemberPayOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountUsdt" REAL NOT NULL,
    "payToAddress" TEXT NOT NULL,
    "usdtContract" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "txId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberPayOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberRegisterCode_code_key" ON "MemberRegisterCode"("code");
CREATE UNIQUE INDEX "MemberRegisterCode_orderId_key" ON "MemberRegisterCode"("orderId");
CREATE UNIQUE INDEX "MemberPayOrder_txId_key" ON "MemberPayOrder"("txId");
