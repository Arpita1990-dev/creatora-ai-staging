export const PLAN_CATALOG = Object.freeze({
  free: {
    code: "free", name: "Free", accountType: "PERSONAL", monthlyPrice: 0,
    monthlyCredits: 20, maxProjects: 2, maxTeamMembers: 1,
    maxFacebookAccounts: 0, maxInstagramAccounts: 0,
    maxLinkedInAccounts: 0, maxYouTubeAccounts: 0,
    imageGeneration: true, imageGenerationLimit: 5, videoGeneration: true, videoGenerationLimit: 5, avatarVideo: false,
    watermark: true, supportLevel: "BASIC",
  },
  creator: {
    code: "creator", name: "Creator", accountType: "PERSONAL", monthlyPrice: 59900,
    monthlyCredits: 200, maxProjects: 10, maxTeamMembers: 1,
    maxFacebookAccounts: 1, maxInstagramAccounts: 1,
    maxLinkedInAccounts: 1, maxYouTubeAccounts: 1,
    imageGeneration: true, imageGenerationLimit: 25, videoGeneration: true, videoGenerationLimit: 15, avatarVideo: true, avatarVideoGenerationLimit: 15,
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
  const { envPlanId: _envPlanId, envPlanIdFallback: _envPlanIdFallback, avatarVideo, videoGenerationLimit: _videoGenerationLimit, avatarVideoGenerationLimit: _avatarVideoGenerationLimit, ...data } = plan;
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

export async function lockWorkspaceQuota(tx, organizationId) {
  await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
}

export async function assertGenerationQuota(prisma, entitlement, { organizationId, kind, avatarVideo = false }) {
  let limit;
  let count;
  let label;
  let generationType;

  if (kind === "image") {
    limit = entitlement.imageGenerationLimit;
    label = "image";
    generationType = "IMAGE";
    if (limit != null) {
      if (entitlement.code === "free") {
        count = await prisma.generationUsage.count({
          where: { organizationId, generationType, avatarVideo: false, status: { in: ["RESERVED", "COMPLETED"] }, OR: [{ status: "COMPLETED" }, { expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        });
      } else {
        count = await prisma.generationJob.count({ where: { organizationId, type: generationType, status: { not: "FAILED" } } });
      }
    }
  } else if (kind === "video") {
    limit = avatarVideo ? entitlement.avatarVideoGenerationLimit : entitlement.videoGenerationLimit;
    label = avatarVideo ? "avatar video" : "video";
    generationType = "VIDEO";
    if (limit != null) {
      if (entitlement.code === "free") {
        count = await prisma.generationUsage.count({
          where: { organizationId, generationType, avatarVideo, status: { in: ["RESERVED", "COMPLETED"] }, OR: [{ status: "COMPLETED" }, { expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        });
      } else {
        const jobs = await prisma.generationJob.findMany({
          where: { organizationId, type: generationType, status: { not: "FAILED" } },
          select: { requestPayload: true },
        });
        count = jobs.filter((job) => {
          try { return Boolean(JSON.parse(job.requestPayload || "{}").avatarConfig?.enabled) === avatarVideo; }
          catch { return !avatarVideo; }
        }).length;
      }
    }
  }

  if (limit == null || count < limit) return;
  const error = new Error(entitlement.code === "free"
    ? `You've used all ${limit} Free AI ${label} generations. Upgrade your plan to continue creating.`
    : `The ${entitlement.plan.name} ${label} generation limit of ${limit} has been reached. Upgrade to continue.`);
  error.code = entitlement.code === "free" ? "GENERATION_LIMIT_REACHED" : "UPGRADE_REQUIRED";
  error.generationType = generationType;
  error.limit = limit;
  error.used = count;
  throw error;
}

export function assertProjectCapacity(entitlement, count) {
  if (entitlement.maxProjects != null && count >= entitlement.maxProjects) {
    const error = new Error(entitlement.code === "free"
      ? `You've reached the Free plan limit of ${entitlement.maxProjects} projects. Upgrade your plan to create more projects.`
      : `This plan supports up to ${entitlement.maxProjects} projects. Upgrade to create another project.`);
    error.code = entitlement.code === "free" ? "PROJECT_LIMIT_REACHED" : "UPGRADE_REQUIRED";
    error.limit = entitlement.maxProjects;
    error.used = count;
    throw error;
  }
}

export async function createProjectWithCapacity(prisma, organizationId, data) {
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceQuota(tx, organizationId);
    const entitlement = await workspaceEntitlements(tx, organizationId);
    const count = await tx.project.count({ where: { organizationId, status: { not: "ARCHIVED" } } });
    assertProjectCapacity(entitlement, count);
    return tx.project.create({ data });
  });
}

export async function reserveGenerationUsage(tx, { organizationId, userId, kind, avatarVideo = false, idempotencyKey, generationJobId = null }) {
  if (!(["image", "video"].includes(kind))) return null;
  const entitlement = await workspaceEntitlements(tx, organizationId);
  assertGenerationEntitlement(entitlement, { kind, avatarVideo });
  const existing = await tx.generationUsage.findUnique({ where: { idempotencyKey } });
  if (existing && ["RESERVED", "COMPLETED"].includes(existing.status)) return existing;
  await assertGenerationQuota(tx, entitlement, { organizationId, kind, avatarVideo });
  const generationType = kind === "video" ? "VIDEO" : "IMAGE";
  const data = {
    organizationId,
    userId,
    idempotencyKey,
    generationJobId,
    generationType,
    status: "RESERVED",
    avatarVideo,
    planAtGeneration: entitlement.code,
    countedAt: null,
    expiresAt: null,
  };
  if (existing) return tx.generationUsage.update({ where: { id: existing.id }, data });
  return tx.generationUsage.create({ data });
}

export async function setGenerationUsageStatus(prisma, where, status, providerRequestId = undefined) {
  const data = {
    status,
    countedAt: status === "COMPLETED" ? new Date() : null,
    expiresAt: null,
  };
  if (providerRequestId !== undefined) data.providerRequestId = providerRequestId;
  return prisma.generationUsage.updateMany({
    where: { ...where, status: "RESERVED" },
    data,
  });
}

export async function generationUsageTotals(prisma, organizationId, entitlement) {
  const activeReservation = { OR: [{ status: "COMPLETED" }, { status: "RESERVED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] };
  const [projects, images, videos] = await Promise.all([
    prisma.project.count({ where: { organizationId, status: { not: "ARCHIVED" } } }),
    prisma.generationUsage.count({ where: { organizationId, generationType: "IMAGE", avatarVideo: false, ...activeReservation } }),
    prisma.generationUsage.count({ where: { organizationId, generationType: "VIDEO", avatarVideo: false, ...activeReservation } }),
  ]);
  return {
    plan: entitlement.code,
    projects: { used: projects, limit: entitlement.maxProjects },
    images: { used: images, limit: entitlement.imageGenerationLimit },
    videos: { used: videos, limit: entitlement.videoGenerationLimit },
  };
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
