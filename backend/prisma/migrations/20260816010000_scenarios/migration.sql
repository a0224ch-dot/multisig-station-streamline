-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "builtinKey" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "imagesJson" TEXT NOT NULL DEFAULT '[]',
    "refPrefix" TEXT NOT NULL DEFAULT 'scene',
    "templateHint" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_builtinKey_key" ON "Scenario"("builtinKey");

-- CreateIndex
CREATE INDEX "Scenario_enabled_sortOrder_idx" ON "Scenario"("enabled", "sortOrder");
