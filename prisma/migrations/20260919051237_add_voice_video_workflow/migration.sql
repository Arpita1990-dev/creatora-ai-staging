-- CreateTable
CREATE TABLE "VoiceInput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "transcript" TEXT,
    "language" TEXT,
    "durationSeconds" INTEGER,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VoiceVideoJob" (
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
    "durationSeconds" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "VoiceInput_userId_createdAt_idx" ON "VoiceInput"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceInput_organizationId_createdAt_idx" ON "VoiceInput"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceInput_status_idx" ON "VoiceInput"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceVideoJob_generationJobId_key" ON "VoiceVideoJob"("generationJobId");

-- CreateIndex
CREATE INDEX "VoiceVideoJob_userId_createdAt_idx" ON "VoiceVideoJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceVideoJob_organizationId_createdAt_idx" ON "VoiceVideoJob"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceVideoJob_voiceInputId_idx" ON "VoiceVideoJob"("voiceInputId");

-- CreateIndex
CREATE INDEX "VoiceVideoJob_status_idx" ON "VoiceVideoJob"("status");
