-- CreateEnum-like tables are represented as TEXT in SQLite by Prisma.
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "organizationId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'META',
    "providerAccountId" TEXT,
    "accountName" TEXT,
    "accessTokenEncrypted" TEXT,
    "tokenExpiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'CONNECTING',
    "connectedBy" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "SocialConnection_userId_provider_status_idx" ON "SocialConnection"("userId", "provider", "status");
CREATE INDEX "SocialConnection_organizationId_provider_status_idx" ON "SocialConnection"("organizationId", "provider", "status");

CREATE TABLE "PublishJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "assetId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "caption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "platformPostId" TEXT,
    "platformPostUrl" TEXT,
    "errorMessage" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME
);

CREATE INDEX "PublishJob_userId_createdAt_idx" ON "PublishJob"("userId", "createdAt");
CREATE INDEX "PublishJob_organizationId_status_idx" ON "PublishJob"("organizationId", "status");
CREATE INDEX "PublishJob_assetId_platform_idx" ON "PublishJob"("assetId", "platform");
