-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "prompt" TEXT,
    "platforms" TEXT NOT NULL DEFAULT '[]',
    "aspectRatio" TEXT,
    "durationSeconds" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'MUAPI',
    "providerJobId" TEXT,
    "providerStatus" TEXT,
    "outputUrl" TEXT,
    "thumbnailUrl" TEXT,
    "errorMessage" TEXT,
    "estimatedCredits" INTEGER NOT NULL DEFAULT 0,
    "chargedCredits" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_providerJobId_key" ON "Asset"("providerJobId");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "Asset_campaignId_idx" ON "Asset"("campaignId");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_assetType_idx" ON "Asset"("assetType");
