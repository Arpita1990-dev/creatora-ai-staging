ALTER TABLE "Plan" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'PERSONAL';
ALTER TABLE "Plan" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Plan" ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "Plan" ADD COLUMN "razorpayPlanId" TEXT;
ALTER TABLE "Plan" ADD COLUMN "maxProjects" INTEGER;
ALTER TABLE "Plan" ADD COLUMN "maxFacebookAccounts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "maxInstagramAccounts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "imageGeneration" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN "imageGenerationLimit" INTEGER;
ALTER TABLE "Plan" ADD COLUMN "videoGeneration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Plan" ADD COLUMN "watermark" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN "supportLevel" TEXT NOT NULL DEFAULT 'BASIC';

CREATE TABLE "BillingAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "userId" TEXT,
  "organizationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BillingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BillingAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BillingAccount_type_userId_key" ON "BillingAccount"("type", "userId");
CREATE UNIQUE INDEX "BillingAccount_type_organizationId_key" ON "BillingAccount"("type", "organizationId");
CREATE INDEX "BillingAccount_userId_idx" ON "BillingAccount"("userId");
CREATE INDEX "BillingAccount_organizationId_idx" ON "BillingAccount"("organizationId");

ALTER TABLE "Subscription" ADD COLUMN "billingAccountId" TEXT REFERENCES "BillingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Subscription_billingAccountId_key" ON "Subscription"("billingAccountId");

INSERT INTO "BillingAccount" ("id", "type", "userId", "organizationId", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), o."accountType", CASE WHEN o."accountType" = 'PERSONAL' THEN o."ownerId" ELSE NULL END, CASE WHEN o."accountType" = 'ORGANIZATION' THEN o."id" ELSE NULL END, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o;

UPDATE "Subscription"
SET "billingAccountId" = (
  SELECT b."id" FROM "BillingAccount" b
  JOIN "Organization" o ON o."id" = "Subscription"."organizationId"
  WHERE (o."accountType" = 'ORGANIZATION' AND b."organizationId" = o."id")
     OR (o."accountType" = 'PERSONAL' AND b."userId" = o."ownerId")
  LIMIT 1
);
