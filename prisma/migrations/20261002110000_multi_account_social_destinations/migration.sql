-- Multi-account social publishing.
-- SocialConnection keeps holding the encrypted OAuth authorization, while each
-- publishable external account (Facebook Page, Instagram Business account,
-- LinkedIn member/organization, YouTube channel) becomes its own row so it can
-- be listed and disconnected independently.
CREATE TABLE "SocialDestination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "socialConnectionId" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "handle" TEXT,
    "thumbnail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialDestination_socialConnectionId_fkey" FOREIGN KEY ("socialConnectionId") REFERENCES "SocialConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SocialDestination_socialConnectionId_providerAccountId_key" ON "SocialDestination"("socialConnectionId", "providerAccountId");
CREATE UNIQUE INDEX "SocialDestination_userId_provider_providerAccountId_key" ON "SocialDestination"("userId", "provider", "providerAccountId");
CREATE UNIQUE INDEX "SocialDestination_organizationId_provider_providerAccountId_key" ON "SocialDestination"("organizationId", "provider", "providerAccountId");
CREATE INDEX "SocialDestination_userId_provider_status_idx" ON "SocialDestination"("userId", "provider", "status");
CREATE INDEX "SocialDestination_organizationId_provider_status_idx" ON "SocialDestination"("organizationId", "provider", "status");

ALTER TABLE "PublishJob" ADD COLUMN "connectionId" TEXT;
ALTER TABLE "PublishJob" ADD COLUMN "destinationId" TEXT;
ALTER TABLE "PublishJob" ADD COLUMN "destinationName" TEXT;