ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "pendingProviderSubscriptionId" TEXT;
