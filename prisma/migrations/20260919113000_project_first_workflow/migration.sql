ALTER TABLE "Project" ADD COLUMN "prompt" TEXT;
ALTER TABLE "Project" ADD COLUMN "configuration" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Project" ADD COLUMN "inputMethod" TEXT NOT NULL DEFAULT 'TEXT';
ALTER TABLE "Project" ADD COLUMN "platform" TEXT;
ALTER TABLE "Project" ADD COLUMN "aspectRatio" TEXT;
ALTER TABLE "Project" ADD COLUMN "outputType" TEXT NOT NULL DEFAULT 'IMAGE';

ALTER TABLE "Asset" ADD COLUMN "projectId" TEXT;
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");
