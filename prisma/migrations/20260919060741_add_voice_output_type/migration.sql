-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VoiceVideoJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "voiceInputId" TEXT NOT NULL,
    "campaignId" TEXT,
    "generationJobId" TEXT,
    "briefJson" TEXT NOT NULL,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "provider" TEXT NOT NULL DEFAULT 'MUAPI',
    "providerJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "outputUrl" TEXT,
    "thumbnailUrl" TEXT,
    "outputType" TEXT NOT NULL DEFAULT 'VIDEO',
    "durationSeconds" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_VoiceVideoJob" ("aspectRatio", "briefJson", "campaignId", "completedAt", "createdAt", "durationSeconds", "errorMessage", "generationJobId", "id", "organizationId", "outputUrl", "progress", "provider", "providerJobId", "settingsJson", "status", "thumbnailUrl", "updatedAt", "userId", "voiceInputId") SELECT "aspectRatio", "briefJson", "campaignId", "completedAt", "createdAt", "durationSeconds", "errorMessage", "generationJobId", "id", "organizationId", "outputUrl", "progress", "provider", "providerJobId", "settingsJson", "status", "thumbnailUrl", "updatedAt", "userId", "voiceInputId" FROM "VoiceVideoJob";
DROP TABLE "VoiceVideoJob";
ALTER TABLE "new_VoiceVideoJob" RENAME TO "VoiceVideoJob";
CREATE UNIQUE INDEX "VoiceVideoJob_generationJobId_key" ON "VoiceVideoJob"("generationJobId");
CREATE INDEX "VoiceVideoJob_userId_createdAt_idx" ON "VoiceVideoJob"("userId", "createdAt");
CREATE INDEX "VoiceVideoJob_organizationId_createdAt_idx" ON "VoiceVideoJob"("organizationId", "createdAt");
CREATE INDEX "VoiceVideoJob_voiceInputId_idx" ON "VoiceVideoJob"("voiceInputId");
CREATE INDEX "VoiceVideoJob_status_idx" ON "VoiceVideoJob"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
