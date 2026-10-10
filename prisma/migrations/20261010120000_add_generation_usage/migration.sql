CREATE TYPE "GenerationUsageStatus" AS ENUM ('RESERVED', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "GenerationUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "generationJobId" TEXT,
    "providerRequestId" TEXT,
    "generationType" "GenerationType" NOT NULL,
    "status" "GenerationUsageStatus" NOT NULL DEFAULT 'RESERVED',
    "avatarVideo" BOOLEAN NOT NULL DEFAULT false,
    "planAtGeneration" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GenerationUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GenerationUsage_generationJobId_key" ON "GenerationUsage"("generationJobId");
CREATE UNIQUE INDEX "GenerationUsage_idempotencyKey_key" ON "GenerationUsage"("idempotencyKey");
CREATE UNIQUE INDEX "GenerationUsage_providerRequestId_key" ON "GenerationUsage"("providerRequestId");
CREATE INDEX "GenerationUsage_organizationId_generationType_status_idx" ON "GenerationUsage"("organizationId", "generationType", "status");
CREATE INDEX "GenerationUsage_organizationId_createdAt_idx" ON "GenerationUsage"("organizationId", "createdAt");

INSERT INTO "GenerationUsage" (
    "id", "organizationId", "userId", "idempotencyKey", "generationJobId", "generationType",
    "status", "avatarVideo", "planAtGeneration", "countedAt", "createdAt", "updatedAt"
)
SELECT
    'legacy_' || job."id",
    job."organizationId",
    job."userId",
    'legacy_' || job."id",
    job."id",
    job."type",
    CASE job."status"
        WHEN 'COMPLETED' THEN 'COMPLETED'::"GenerationUsageStatus"
        WHEN 'FAILED' THEN 'FAILED'::"GenerationUsageStatus"
        WHEN 'CANCELLED' THEN 'CANCELLED'::"GenerationUsageStatus"
        ELSE 'RESERVED'::"GenerationUsageStatus"
    END,
    CASE WHEN job."requestPayload" LIKE '%"avatarConfig":{"enabled":true%' THEN true ELSE false END,
    'legacy-unknown',
    CASE WHEN job."status" = 'COMPLETED' THEN COALESCE(job."completedAt", job."createdAt") ELSE NULL END,
    job."createdAt",
    CURRENT_TIMESTAMP
FROM "GenerationJob" AS job
WHERE job."type" IN ('IMAGE', 'VIDEO')
    AND COALESCE(job."requestPayload", '') NOT LIKE '%"mock":true%';