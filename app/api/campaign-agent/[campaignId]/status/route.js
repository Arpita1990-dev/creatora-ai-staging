import { campaignJson, getAuthenticatedUser, getCampaign, getCampaignAssets, getCampaignJobs } from '../../_lib';
import { prisma } from '@/lib/prisma';
import { syncGenerationJob } from '@/lib/generationJobs';
import { mediaUrlForWorkspace } from '@/lib/mediaDelivery';

export async function GET(request, { params }) {
  const user = await getAuthenticatedUser(request);
  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId, user.workspaceId);
  if (!campaign) return campaignJson({ error: 'Campaign not found.' }, { status: 404 });
  const activeJobs = await prisma.generationJob.findMany({
    where: { campaignId, organizationId: user.workspaceId, status: { in: ['QUEUED', 'SUBMITTED', 'PROCESSING'] } },
  });
  await Promise.all(activeJobs.map((job) => syncGenerationJob(job)));
  const jobs = await getCampaignJobs(campaignId);
  const assets = await getCampaignAssets(campaign.id);
  const latest = await getCampaign(campaign.id, user.workspaceId) || campaign;
  const signedJobs = await Promise.all(jobs.map(async (job) => ({
    ...job,
    outputUrl: await mediaUrlForWorkspace(job.outputUrl, user.workspaceId),
    thumbnailUrl: await mediaUrlForWorkspace(job.thumbnailUrl, user.workspaceId),
  })));
  const signedAssets = await Promise.all(assets.map(async (asset) => ({
    ...asset,
    outputUrl: await mediaUrlForWorkspace(asset.outputUrl, user.workspaceId),
    thumbnailUrl: await mediaUrlForWorkspace(asset.thumbnailUrl, user.workspaceId),
  })));
  return campaignJson({
    campaignId: latest.id,
    status: latest.status,
    approvals: latest.approvals,
    estimatedCredits: latest.estimatedCredits || 0,
    jobs: signedJobs.map((job) => ({
      jobId: job.jobId,
      assetId: job.assetId,
      type: job.type,
      title: job.title,
      status: job.status,
      stage: job.stage,
      progressMessage: job.progressMessage,
      providerStatus: job.providerStatus,
      progress: job.progress,
      outputUrl: job.outputUrl,
      thumbnailUrl: job.thumbnailUrl,
      creditsCharged: job.creditsCharged || job.actualCredits || 0,
      estimatedCredits: job.estimatedCredits,
      error: job.status === 'FAILED' ? job.error || 'Generation failed.' : null,
      platform: job.platform,
      aspectRatio: job.aspectRatio,
      duration: job.duration,
    })),
    assets: signedAssets.map(({ provider, providerJobId, providerStatus, ...asset }) => asset),
    updatedAt: latest.updatedAt,
  });
}
