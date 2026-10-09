export const PLAN_CATALOG = Object.freeze({
  free: {
    code: "free", name: "Free", accountType: "PERSONAL", monthlyPrice: 0,
    monthlyCredits: 20, maxProjects: 2, maxTeamMembers: 1,
    maxFacebookAccounts: 0, maxInstagramAccounts: 0,
    maxLinkedInAccounts: 0, maxYouTubeAccounts: 0,
    imageGeneration: true, imageGenerationLimit: 10, videoGeneration: false, avatarVideo: false,
    watermark: true, supportLevel: "BASIC",
  },
  creator: {
    code: "creator", name: "Creator", accountType: "PERSONAL", monthlyPrice: 59900,
    monthlyCredits: 200, maxProjects: 10, maxTeamMembers: 1,
    maxFacebookAccounts: 1, maxInstagramAccounts: 1,
    maxLinkedInAccounts: 1, maxYouTubeAccounts: 1,
    imageGeneration: true, imageGenerationLimit: null, videoGeneration: true, avatarVideo: true,
    watermark: false, supportLevel: "STANDARD", envPlanId: "RAZORPAY_CREATOR_INR_PLAN_ID", envPlanIdFallback: "RAZORPAY_CREATOR_MONTHLY_PLAN_ID",
  },
  pro: {
    code: "pro", name: "Pro", accountType: "PERSONAL", monthlyPrice: 149900,
    monthlyCredits: 1000, maxProjects: null, maxTeamMembers: 1,
    maxFacebookAccounts: 5, maxInstagramAccounts: 5,
    maxLinkedInAccounts: 5, maxYouTubeAccounts: 5,
    imageGeneration: true, imageGenerationLimit: null, videoGeneration: true, avatarVideo: true,
    watermark: false, supportLevel: "PRIORITY", envPlanId: "RAZORPAY_PRO_INR_PLAN_ID", envPlanIdFallback: "RAZORPAY_PRO_MONTHLY_PLAN_ID",
  },
  business: {
    code: "business", name: "Business", accountType: "ORGANIZATION", monthlyPrice: 499900,
    monthlyCredits: 2500, maxProjects: null, maxTeamMembers: 10,
    maxFacebookAccounts: 10, maxInstagramAccounts: 10,
    maxLinkedInAccounts: 10, maxYouTubeAccounts: 10,
    imageGeneration: true, imageGenerationLimit: null, videoGeneration: true, avatarVideo: true,
    watermark: false, supportLevel: "BUSINESS_PRIORITY", envPlanId: "RAZORPAY_BUSINESS_INR_PLAN_ID", envPlanIdFallback: "RAZORPAY_BUSINESS_MONTHLY_PLAN_ID",
  },
});

export function planDefinition(code) {
  return PLAN_CATALOG[String(code || "").toLowerCase()] || null;
}

// Resolves the server-only Razorpay plan id for a plan. `envPlanId` is the
// canonical variable (RAZORPAY_<PLAN>_INR_PLAN_ID); `envPlanIdFallback` accepts
// the older RAZORPAY_<PLAN>_MONTHLY_PLAN_ID spelling so existing deployments
// keep working. Only the first non-empty value is used, and the value never
// leaves the server.
export function planEnvId(plan) {
  if (!plan?.envPlanId) return null;
  return process.env[plan.envPlanId] || process.env[plan.envPlanIdFallback] || null;
}

export function planRecordData(code) {
  const plan = planDefinition(code);
  if (!plan) return null;
  const { envPlanId: _envPlanId, envPlanIdFallback: _envPlanIdFallback, avatarVideo, ...data } = plan;
  return {
    ...data,
    annualPrice: data.monthlyPrice * 12,
    currency: "INR",
    billingInterval: "MONTHLY",
    razorpayPlanId: planEnvId(plan),
    features: JSON.stringify(Object.entries({ ...data, avatarVideo }).filter(([, value]) => value === true).map(([key]) => key)),
  };
}

export async function ensurePlans(prisma) {
  const records = [];
  for (const code of Object.keys(PLAN_CATALOG)) {
    const data = planRecordData(code);
    records.push(await prisma.plan.upsert({ where: { code }, create: data, update: data }));
  }
  return records;
}

export async function workspaceEntitlements(prisma, organizationId) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!organization) throw new Error("Organization not found.");
  const subscription = organization.subscription;
  const active = subscription && (subscription.status === "ACTIVE" || (subscription.status === "TRIALING" && subscription.plan?.code === "free"));
  const fallbackCode = "free";
  const persisted = active ? subscription.plan : null;
  const definition = planDefinition(persisted?.code || fallbackCode);
  const plan = persisted ? { ...persisted, ...definition } : definition;
  return {
    organization, subscription, plan,
    code: plan.code, ...definition,
  };
}

export function assertPlanAccountType(plan, accountType) {
  if (!plan) throw new Error("Unknown plan.");
  if (plan.accountType !== accountType) {
    throw new Error(plan.accountType === "ORGANIZATION" ? "Business requires an organization workspace." : "This plan is only available to personal workspaces.");
  }
}

export function assertGenerationEntitlement(entitlement, { kind, avatarVideo = false }) {
  const error = new Error(avatarVideo ? "AI Avatar Video requires Creator, Pro, or Business. Upgrade to continue." : "Video generation requires Creator, Pro, or Business. Upgrade to continue.");
  error.code = "UPGRADE_REQUIRED";
  if (avatarVideo && !entitlement.avatarVideo) throw error;
  if (kind === "video" && !entitlement.videoGeneration) throw error;
  if (kind === "image" && !entitlement.imageGeneration) {
    error.message = "Image generation is not included in this plan. Upgrade to continue.";
    throw error;
  }
}

export function assertProjectCapacity(entitlement, count) {
  if (entitlement.maxProjects != null && count >= entitlement.maxProjects) {
    const error = new Error(`This plan supports up to ${entitlement.maxProjects} projects. Upgrade to create another project.`);
    error.code = "UPGRADE_REQUIRED";
    throw error;
  }
}

export function assertSocialAccountCapacity(entitlement, platform, count, additions = 1) {
  if (additions <= 0) return;
  const key = { FACEBOOK: "maxFacebookAccounts", INSTAGRAM: "maxInstagramAccounts", LINKEDIN: "maxLinkedInAccounts", YOUTUBE: "maxYouTubeAccounts" }[platform];
  const limit = key ? Number(entitlement[key] || 0) : 0;
  if (count + additions > limit) {
    const error = new Error(`${platform} account limit reached. Your plan allows ${limit}. Upgrade or disconnect an account to continue.`);
    error.code = "UPGRADE_REQUIRED";
    throw error;
  }
}
