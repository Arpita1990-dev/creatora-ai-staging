-- AlterTable
ALTER TABLE "ProviderCredential" ADD COLUMN "lastBalanceCredits" INTEGER;
ALTER TABLE "ProviderCredential" ADD COLUMN "lastBalanceSyncAt" DATETIME;
ALTER TABLE "ProviderCredential" ADD COLUMN "lastBalanceUsd" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'PERSONAL',
    "monthlyPrice" INTEGER NOT NULL,
    "annualPrice" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "billingInterval" TEXT NOT NULL,
    "razorpayPlanId" TEXT,
    "monthlyCredits" INTEGER NOT NULL,
    "maxProjects" INTEGER,
    "maxTeamMembers" INTEGER NOT NULL,
    "maxFacebookAccounts" INTEGER NOT NULL DEFAULT 0,
    "maxInstagramAccounts" INTEGER NOT NULL DEFAULT 0,
    "imageGeneration" BOOLEAN NOT NULL DEFAULT true,
    "imageGenerationLimit" INTEGER,
    "videoGeneration" BOOLEAN NOT NULL DEFAULT false,
    "watermark" BOOLEAN NOT NULL DEFAULT true,
    "supportLevel" TEXT NOT NULL,
    "features" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Plan" ("accountType", "active", "annualPrice", "billingInterval", "code", "createdAt", "currency", "features", "id", "imageGeneration", "imageGenerationLimit", "maxFacebookAccounts", "maxInstagramAccounts", "maxProjects", "maxTeamMembers", "monthlyCredits", "monthlyPrice", "name", "razorpayPlanId", "supportLevel", "updatedAt", "videoGeneration", "watermark") SELECT "accountType", "active", "annualPrice", "billingInterval", "code", "createdAt", "currency", "features", "id", "imageGeneration", "imageGenerationLimit", "maxFacebookAccounts", "maxInstagramAccounts", "maxProjects", "maxTeamMembers", "monthlyCredits", "monthlyPrice", "name", "razorpayPlanId", "supportLevel", "updatedAt", "videoGeneration", "watermark" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
