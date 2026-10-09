-- Keep one SocialConnection identity per provider account and workspace.
-- Failed/repeated OAuth attempts remain available for diagnostics, but only
-- the preferred row retains the provider account identity.
UPDATE "SocialConnection"
SET "providerAccountId" = NULL
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT
            "id",
            ROW_NUMBER() OVER (
                PARTITION BY "userId", "organizationId", "provider", "providerAccountId"
                ORDER BY CASE WHEN "status" = 'CONNECTED' THEN 0 ELSE 1 END, "updatedAt" DESC, "id" DESC
            ) AS row_number
        FROM "SocialConnection"
        WHERE "providerAccountId" IS NOT NULL
    )
    WHERE row_number > 1
);

CREATE UNIQUE INDEX "SocialConnection_userId_provider_providerAccountId_key"
ON "SocialConnection"("userId", "provider", "providerAccountId");

CREATE UNIQUE INDEX "SocialConnection_organizationId_provider_providerAccountId_key"
ON "SocialConnection"("organizationId", "provider", "providerAccountId");