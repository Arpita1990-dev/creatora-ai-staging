ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "pendingPlanId" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingChangeType" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingChangeStatus" TEXT;
