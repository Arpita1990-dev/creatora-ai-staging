export const PHASE1_MODELS = [
  ["User", "user"],
  ["Organization", "organization"],
  ["Plan", "plan"],
  ["Asset", "asset"],
  ["OAuthAccount", "oAuthAccount"],
  ["EmailVerificationToken", "emailVerificationToken"],
  ["PasswordResetToken", "passwordResetToken"],
  ["RefreshSession", "refreshSession"],
  ["OrganizationMember", "organizationMember"],
  ["TeamInvitation", "teamInvitation"],
  ["BillingAccount", "billingAccount"],
  ["Subscription", "subscription"],
  ["CreditWallet", "creditWallet"],
  ["CreditTransaction", "creditTransaction"],
  ["AuditLog", "auditLog"],
  ["Project", "project"],
  ["Campaign", "campaign"],
  ["GenerationJob", "generationJob"],
  ["ProviderAttempt", "providerAttempt"],
  ["VoiceInput", "voiceInput"],
  ["VoiceVideoJob", "voiceVideoJob"],
  ["BrandKit", "brandKit"],
  ["Template", "template"],
  ["Workflow", "workflow"],
  ["WorkflowRun", "workflowRun"],
  ["IntegrationConnection", "integrationConnection"],
  ["SocialConnection", "socialConnection"],
  ["SocialDestination", "socialDestination"],
  ["ProviderCredential", "providerCredential"],
  ["PublishJob", "publishJob"],
  ["ApiKey", "apiKey"],
  ["Notification", "notification"],
];

export function requirePhase1Urls(environment = process.env) {
  const sourceUrl = environment.SOURCE_DATABASE_URL || environment.LEGACY_DATABASE_URL;
  const targetUrl = environment.TARGET_DATABASE_URL;
  if (!sourceUrl?.startsWith("file:")) {
    throw new Error("SOURCE_DATABASE_URL must be an explicit SQLite file URL.");
  }
  if (!/^postgres(ql)?:\/\//i.test(targetUrl || "")) {
    throw new Error("TARGET_DATABASE_URL must be an explicit PostgreSQL connection URL.");
  }
  const sourceChecksum = environment.SOURCE_DATABASE_SHA256;
  if (!/^[a-f0-9]{64}$/i.test(sourceChecksum || "")) {
    throw new Error("SOURCE_DATABASE_SHA256 must contain the verified backup checksum.");
  }
  return { sourceUrl, targetUrl, sourceChecksum };
}
