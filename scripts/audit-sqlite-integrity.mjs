import { readSqliteSnapshot } from "./phase1-sqlite-snapshot.mjs";

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.LEGACY_DATABASE_URL;
if (!sourceUrl?.startsWith("file:")) {
  throw new Error("SOURCE_DATABASE_URL must be an explicit SQLite file URL.");
}

const models = [
  ["Asset", "asset"], ["User", "user"], ["OAuthAccount", "oAuthAccount"],
  ["EmailVerificationToken", "emailVerificationToken"], ["PasswordResetToken", "passwordResetToken"],
  ["RefreshSession", "refreshSession"], ["Organization", "organization"],
  ["OrganizationMember", "organizationMember"], ["TeamInvitation", "teamInvitation"],
  ["Plan", "plan"], ["BillingAccount", "billingAccount"], ["Subscription", "subscription"],
  ["CreditWallet", "creditWallet"], ["CreditTransaction", "creditTransaction"],
  ["AuditLog", "auditLog"], ["Project", "project"], ["Campaign", "campaign"],
  ["GenerationJob", "generationJob"], ["ProviderAttempt", "providerAttempt"],
  ["VoiceInput", "voiceInput"], ["VoiceVideoJob", "voiceVideoJob"], ["BrandKit", "brandKit"],
  ["Template", "template"], ["Workflow", "workflow"], ["WorkflowRun", "workflowRun"],
  ["IntegrationConnection", "integrationConnection"], ["SocialConnection", "socialConnection"],
  ["SocialDestination", "socialDestination"], ["ProviderCredential", "providerCredential"],
  ["PublishJob", "publishJob"], ["ApiKey", "apiKey"], ["Notification", "notification"],
];

const jsonFields = {
  Asset: ["platforms"], Plan: ["features"], AuditLog: ["metadata"], Project: ["configuration"],
  Campaign: ["platforms", "strategy", "contentPlan"], GenerationJob: ["requestPayload", "responsePayload"],
  VoiceVideoJob: ["briefJson", "settingsJson"], BrandKit: ["bannedWords", "preferredWords", "additionalRules"],
  Template: ["configuration"], Workflow: ["definition"], WorkflowRun: ["input", "output"],
  IntegrationConnection: ["scopes", "metadata"], SocialConnection: ["scopes", "metadata"],
  ApiKey: ["scopes"], Notification: ["metadata"],
};

const anomalyCounts = new Map();
const add = (name, count = 1) => {
  if (count) anomalyCounts.set(name, (anomalyCounts.get(name) || 0) + count);
};
const duplicateCount = (rows, key) => {
  const counts = new Map();
  for (const row of rows) {
    const value = key(row);
    if (value == null || value === "") continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
};
const ids = (rows) => new Set(rows.map((row) => row.id));
const missing = (rows, field, validIds) => rows.filter((row) => row[field] != null && !validIds.has(row[field])).length;

try {
  const counts = {};
  const snapshot = readSqliteSnapshot(sourceUrl, { expectedChecksum: process.env.SOURCE_DATABASE_SHA256 });
  const { rowsByModel } = snapshot;
  for (const { check, count } of snapshot.anomalies) add(check, count);
  for (const [name] of models) {
    counts[name] = rowsByModel[name].length;
  }

  const users = rowsByModel.User;
  const organizations = rowsByModel.Organization;
  const memberships = rowsByModel.OrganizationMember;
  const plans = rowsByModel.Plan;
  const billingAccounts = rowsByModel.BillingAccount;
  const subscriptions = rowsByModel.Subscription;
  const projects = rowsByModel.Project;
  const campaigns = rowsByModel.Campaign;
  const assets = rowsByModel.Asset;
  const jobs = rowsByModel.GenerationJob;
  const attempts = rowsByModel.ProviderAttempt;
  const connections = rowsByModel.SocialConnection;
  const destinations = rowsByModel.SocialDestination;

  const userIds = ids(users);
  const organizationIds = ids(organizations);
  const planIds = ids(plans);
  const billingIds = ids(billingAccounts);
  const projectIds = ids(projects);
  const campaignIds = ids(campaigns);
  const assetIds = ids(assets);
  const jobIds = ids(jobs);
  const connectionIds = ids(connections);

  add("duplicate User.email", duplicateCount(users, (row) => row.email.toLowerCase()));
  add("duplicate OrganizationMember organizationId+userId", duplicateCount(memberships, (row) => `${row.organizationId}:${row.userId}`));
  add("duplicate Subscription.providerSubscriptionId", duplicateCount(subscriptions, (row) => row.providerSubscriptionId));
  add("duplicate GenerationJob.providerJobId", duplicateCount(jobs, (row) => row.providerJobId));
  add("duplicate Asset.providerJobId", duplicateCount(assets, (row) => row.providerJobId));
  add("duplicate ProviderCredential provider+userId", duplicateCount(rowsByModel.ProviderCredential, (row) => row.userId ? `${row.provider}:${row.userId}` : null));
  add("duplicate ProviderCredential provider+organizationId", duplicateCount(rowsByModel.ProviderCredential, (row) => row.organizationId ? `${row.provider}:${row.organizationId}` : null));
  add("duplicate SocialDestination user scope", duplicateCount(destinations, (row) => row.userId ? `${row.userId}:${row.provider}:${row.providerAccountId}` : null));
  add("duplicate SocialDestination organization scope", duplicateCount(destinations, (row) => row.organizationId ? `${row.organizationId}:${row.provider}:${row.providerAccountId}` : null));

  add("Organization.ownerId orphan", missing(organizations, "ownerId", userIds));
  add("OrganizationMember.organizationId orphan", missing(memberships, "organizationId", organizationIds));
  add("OrganizationMember.userId orphan", missing(memberships, "userId", userIds));
  add("Subscription.organizationId orphan", missing(subscriptions, "organizationId", organizationIds));
  add("Subscription.planId orphan", missing(subscriptions, "planId", planIds));
  add("Subscription.billingAccountId orphan", missing(subscriptions, "billingAccountId", billingIds));
  add("Project.organizationId orphan", missing(projects, "organizationId", organizationIds));
  add("Project.createdById orphan", missing(projects, "createdById", userIds));
  add("Campaign.organizationId orphan", missing(campaigns, "organizationId", organizationIds));
  add("Campaign.projectId orphan", missing(campaigns, "projectId", projectIds));
  add("Campaign.createdById orphan", missing(campaigns, "createdById", userIds));
  add("Asset.userId orphan", missing(assets, "userId", userIds));
  add("Asset.organizationId orphan", missing(assets, "organizationId", organizationIds));
  add("Asset.projectId orphan", missing(assets, "projectId", projectIds));
  add("Asset.campaignId orphan", missing(assets, "campaignId", campaignIds));
  add("GenerationJob.organizationId orphan", missing(jobs, "organizationId", organizationIds));
  add("GenerationJob.userId orphan", missing(jobs, "userId", userIds));
  add("GenerationJob.projectId orphan", missing(jobs, "projectId", projectIds));
  add("GenerationJob.campaignId orphan", missing(jobs, "campaignId", campaignIds));
  add("GenerationJob.assetId orphan", missing(jobs, "assetId", assetIds));
  add("ProviderAttempt.generationJobId orphan", missing(attempts, "generationJobId", jobIds));
  add("SocialDestination.socialConnectionId orphan", missing(destinations, "socialConnectionId", connectionIds));

  const orgById = new Map(organizations.map((row) => [row.id, row]));
  const billingById = new Map(billingAccounts.map((row) => [row.id, row]));
  const connectionById = new Map(connections.map((row) => [row.id, row]));
  add("BillingAccount invalid owner scope", billingAccounts.filter((row) =>
    row.type === "PERSONAL" ? !row.userId || row.organizationId : !row.organizationId || row.userId
  ).length);
  add("Subscription billing owner mismatch", subscriptions.filter((row) => {
    const account = row.billingAccountId ? billingById.get(row.billingAccountId) : null;
    if (!account) return false;
    const organization = orgById.get(row.organizationId);
    return organization?.accountType === "ORGANIZATION"
      ? account.organizationId !== row.organizationId
      : account.userId !== organization?.ownerId;
  }).length);
  add("RefreshSession missing workspace", rowsByModel.RefreshSession.filter((row) => !row.organizationId).length);
  add("ProviderCredential invalid scope", rowsByModel.ProviderCredential.filter((row) => {
    const exclusive = Boolean(row.userId) !== Boolean(row.organizationId);
    if (!exclusive) return true;
    if (row.userId) return !userIds.has(row.userId);
    return !organizationIds.has(row.organizationId) || orgById.get(row.organizationId)?.accountType !== "ORGANIZATION";
  }).length);
  add("SocialConnection invalid scope", connections.filter((row) => {
    const exclusive = Boolean(row.userId) !== Boolean(row.organizationId);
    if (!exclusive) return true;
    return row.userId ? !userIds.has(row.userId) : !organizationIds.has(row.organizationId);
  }).length);
  add("SocialDestination scope differs from connection", destinations.filter((row) => {
    const connection = connectionById.get(row.socialConnectionId);
    return connection && (row.userId !== connection.userId || row.organizationId !== connection.organizationId || row.provider !== connection.provider);
  }).length);
  add("Asset project workspace mismatch", assets.filter((row) => {
    const project = row.projectId ? projects.find((item) => item.id === row.projectId) : null;
    return project && row.organizationId && project.organizationId !== row.organizationId;
  }).length);
  add("Campaign project workspace mismatch", campaigns.filter((row) => {
    const project = row.projectId ? projects.find((item) => item.id === row.projectId) : null;
    return project && project.organizationId !== row.organizationId;
  }).length);

  for (const [model, fields] of Object.entries(jsonFields)) {
    for (const field of fields) {
      add(`malformed JSON ${model}.${field}`, rowsByModel[model].filter((row) => {
        const value = row[field];
        if (value == null || value === "") return false;
        try { JSON.parse(value); return false; } catch { return true; }
      }).length);
    }
  }

  const requiredStrings = {
    User: ["id", "email", "passwordHash"], Organization: ["id", "name", "slug", "ownerId"],
    OrganizationMember: ["id", "organizationId", "userId"], Plan: ["id", "code", "name"],
    Project: ["id", "organizationId", "createdById", "name"], Campaign: ["id", "organizationId", "createdById", "name"],
    Asset: ["id", "userId", "title", "provider"], GenerationJob: ["id", "organizationId", "userId", "provider"],
    ProviderCredential: ["id", "provider", "secretEncrypted", "secretPrefix"],
  };
  for (const [model, fields] of Object.entries(requiredStrings)) {
    for (const field of fields) add(`missing required value ${model}.${field}`, rowsByModel[model].filter((row) => !String(row[field] || "").trim()).length);
  }

  const blockingPrefixes = [
    "duplicate ", "malformed JSON ", "missing required value ",
    "invalid timestamp ", "invalid boolean ", "invalid integer ", "invalid enum ", "foreign key orphan ",
    "BillingAccount invalid owner scope", "Subscription billing owner mismatch",
    "ProviderCredential invalid scope", "SocialConnection invalid scope",
    "SocialDestination scope differs from connection",
    "Organization.ownerId orphan", "OrganizationMember.organizationId orphan",
    "OrganizationMember.userId orphan", "Subscription.organizationId orphan",
    "Subscription.planId orphan", "Subscription.billingAccountId orphan",
    "SocialDestination.socialConnectionId orphan",
  ];
  const anomalies = [...anomalyCounts.entries()].map(([check, count]) => ({ check, count }));
  const blockingAnomalies = anomalies.filter(({ check }) => blockingPrefixes.some((prefix) => check.startsWith(prefix)));
  const warnings = anomalies.filter((entry) => !blockingAnomalies.includes(entry));
  console.log(JSON.stringify({ sourceChecksum: snapshot.checksum, counts, blockingAnomalies, warnings, migrationBlocking: blockingAnomalies.length > 0 }, null, 2));
  if (blockingAnomalies.length) process.exitCode = 2;
} catch {
  console.error("SQLite integrity audit: FAIL. Migration must not proceed.");
  process.exitCode = 2;
}
