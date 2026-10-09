CREATE TABLE "ProviderCredential" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "userId" TEXT,
  "organizationId" TEXT,
  "secretEncrypted" TEXT NOT NULL,
  "secretPrefix" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ProviderCredential_provider_userId_key" ON "ProviderCredential"("provider", "userId");
CREATE UNIQUE INDEX "ProviderCredential_provider_organizationId_key" ON "ProviderCredential"("provider", "organizationId");
CREATE INDEX "ProviderCredential_userId_provider_idx" ON "ProviderCredential"("userId", "provider");
CREATE INDEX "ProviderCredential_organizationId_provider_idx" ON "ProviderCredential"("organizationId", "provider");
