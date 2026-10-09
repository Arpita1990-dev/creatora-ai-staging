import { PrismaClient } from '@prisma/client';

const sourceUrl = process.env.LEGACY_DATABASE_URL;
if (!sourceUrl) throw new Error('LEGACY_DATABASE_URL is required.');

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const target = new PrismaClient();

try {
  const [plans, users, organizations, memberships, wallets, subscriptions, projects, campaigns, assets, generationJobs, providerAttempts] = await Promise.all([
    source.plan.findMany(),
    source.user.findMany(),
    source.organization.findMany(),
    source.organizationMember.findMany(),
    source.creditWallet.findMany(),
    source.subscription.findMany(),
    source.project.findMany(),
    source.campaign.findMany(),
    source.asset.findMany(),
    source.generationJob.findMany(),
    source.providerAttempt.findMany(),
  ]);
  const userIds = new Map();
  const planIds = new Map();

  for (const plan of plans) {
    const saved = await target.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: { name: plan.name, monthlyPrice: plan.monthlyPrice, annualPrice: plan.annualPrice, monthlyCredits: plan.monthlyCredits, maxTeamMembers: plan.maxTeamMembers, features: plan.features, active: plan.active },
    });
    planIds.set(plan.id, saved.id);
  }
  for (const user of users) {
    const saved = await target.user.upsert({ where: { email: user.email }, create: user, update: {} });
    userIds.set(user.id, saved.id);
  }
  for (const organization of organizations) {
    const ownerId = userIds.get(organization.ownerId);
    if (!ownerId) continue;
    await target.organization.upsert({ where: { id: organization.id }, create: { ...organization, ownerId }, update: {} });
  }
  for (const membership of memberships) {
    const userId = userIds.get(membership.userId);
    if (!userId) continue;
    await target.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: membership.organizationId, userId } },
      create: { ...membership, userId },
      update: { role: membership.role, status: membership.status, joinedAt: membership.joinedAt },
    });
  }
  for (const wallet of wallets) {
    await target.creditWallet.upsert({ where: { organizationId: wallet.organizationId }, create: wallet, update: {} });
  }
  for (const subscription of subscriptions) {
    const planId = planIds.get(subscription.planId);
    if (!planId) continue;
    await target.subscription.upsert({ where: { organizationId: subscription.organizationId }, create: { ...subscription, planId }, update: {} });
  }
  for (const project of projects) {
    const createdById = userIds.get(project.createdById);
    if (!createdById) continue;
    const data = { ...project, createdById };
    await target.project.upsert({ where: { id: project.id }, create: data, update: data });
  }
  for (const campaign of campaigns) {
    const createdById = userIds.get(campaign.createdById);
    if (!createdById) continue;
    const data = { ...campaign, createdById };
    await target.campaign.upsert({ where: { id: campaign.id }, create: data, update: data });
  }
  for (const asset of assets) {
    const userId = userIds.get(asset.userId);
    if (!userId) continue;
    const data = { ...asset, userId };
    await target.asset.upsert({ where: { id: asset.id }, create: data, update: data });
  }
  for (const job of generationJobs) {
    const userId = userIds.get(job.userId);
    if (!userId) continue;
    const data = { ...job, userId };
    await target.generationJob.upsert({ where: { id: job.id }, create: data, update: data });
  }
  for (const attempt of providerAttempts) {
    await target.providerAttempt.upsert({ where: { id: attempt.id }, create: attempt, update: attempt });
  }
  console.log(JSON.stringify({
    importedUsers: users.length,
    importedOrganizations: organizations.length,
    importedProjects: projects.length,
    importedCampaigns: campaigns.length,
    importedAssets: assets.length,
    importedGenerationJobs: generationJobs.length,
    importedProviderAttempts: providerAttempts.length,
  }));
} finally {
  await Promise.all([source.$disconnect(), target.$disconnect()]);
}
