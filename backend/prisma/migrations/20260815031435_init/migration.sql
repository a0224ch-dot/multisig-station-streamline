-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PresetSigner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "network" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'LOW',
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Trc20Token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "network" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 6,
    "isStableUsd" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "priceUsdt" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OpenSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'public',
    "createdById" TEXT,
    "network" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "walletAddress" TEXT,
    "tier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalValueUsdt" REAL,
    "signerAddresses" TEXT,
    "unsignedTx" TEXT,
    "txId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpenSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "signerAddresses" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'public',
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openTxId" TEXT
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PresetSigner_network_group_address_key" ON "PresetSigner"("network", "group", "address");

-- CreateIndex
CREATE UNIQUE INDEX "Trc20Token_network_contract_key" ON "Trc20Token"("network", "contract");

-- CreateIndex
CREATE UNIQUE INDEX "PriceQuote_symbol_key" ON "PriceQuote"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "OpenSession_token_key" ON "OpenSession"("token");

-- CreateIndex
CREATE INDEX "OpenSession_token_idx" ON "OpenSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "WalletRecord_network_address_key" ON "WalletRecord"("network", "address");
