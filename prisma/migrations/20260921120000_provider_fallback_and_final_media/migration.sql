ALTER TABLE "Project" ADD COLUMN "finalVideoUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "finalThumbnailUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "successfulProvider" TEXT;
ALTER TABLE "Project" ADD COLUMN "successfulProviderTaskId" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "fallbackCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ProviderAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT,
  "campaignId" TEXT,
  "generationJobId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "taskId" TEXT,
  "attemptNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "failureReason" TEXT,
  "estimatedCost" REAL,
  "actualCost" REAL,
  "idempotencyKey" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ProviderAttempt_idempotencyKey_key" ON "ProviderAttempt"("idempotencyKey");
CREATE INDEX "ProviderAttempt_projectId_provider_idx" ON "ProviderAttempt"("projectId", "provider");
CREATE INDEX "ProviderAttempt_campaignId_idx" ON "ProviderAttempt"("campaignId");
CREATE INDEX "ProviderAttempt_generationJobId_status_idx" ON "ProviderAttempt"("generationJobId", "status");
CREATE INDEX "ProviderAttempt_taskId_idx" ON "ProviderAttempt"("taskId");
