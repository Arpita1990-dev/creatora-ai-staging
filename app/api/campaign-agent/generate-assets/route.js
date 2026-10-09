import { createGenerationJob, serializeGenerationJob } from '@/lib/generationJobs';
import { getMuApiBalance } from '@/lib/muapiAccount';
import { mediaUrlForWorkspace } from '@/lib/mediaDelivery';
import { buildCampaignAssetPackage, calculateCreditCost, campaignJson, getAuthenticatedUser, getCampaign, saveCampaign } from '../_lib';

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);
    const contentType = request.headers.get('content-type') || '';
    let campaignId;
    let assets = [];
    let productImage = null;
    let campaign;
    if (contentType.includes('multipart/form-data')) {
      campaignId = new URL(request.url).searchParams.get('campaignId') || '';
      campaign = await getCampaign(campaignId, user.workspaceId);
      if (!campaign) return campaignJson({ error: 'Campaign not found.' }, { status: 404 });
      if (campaign.userId && campaign.userId !== user.userId) return campaignJson({ error: 'Unauthorized campaign access.' }, { status: 403 });
      if (!campaign.approvals?.strategy) return campaignJson({ error: 'Approve the campaign plan before generating assets.' }, { status: 409 });
      const form = await request.formData();
      try {
        assets = JSON.parse(String(form.get('assets') || '[]'));
      } catch {
        return campaignJson({ error: 'Invalid asset selection.' }, { status: 400 });
      }
      const uploaded = form.get('productImage');
      if (uploaded instanceof File && uploaded.size) {
        if (uploaded.size > 10 * 1024 * 1024) return campaignJson({ error: 'The product image must be 10MB or smaller.' }, { status: 413 });
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(uploaded.type)) return campaignJson({ error: 'Use a PNG, JPG, or WebP product image.' }, { status: 415 });
        productImage = uploaded;
      }
    } else {
      ({ campaignId, assets = [] } = await request.json());
      campaign = await getCampaign(campaignId, user.workspaceId);
      if (!campaign) return campaignJson({ error: 'Campaign not found.' }, { status: 404 });
      if (campaign.userId && campaign.userId !== user.userId) return campaignJson({ error: 'Unauthorized campaign access.' }, { status: 403 });
      if (!campaign.approvals?.strategy) return campaignJson({ error: 'Approve the campaign plan before generating assets.' }, { status: 409 });
    }

    const effectiveBrief = { ...campaign.brief, productImageProvided: Boolean(productImage) };
    const requestedAssets = buildCampaignAssetPackage(assets.length ? assets : campaign.plan.assetRecommendations, effectiveBrief, campaign.plan);
    if (!requestedAssets.length) return campaignJson({ error: 'No campaign assets were selected.' }, { status: 400 });
    const estimatedCredits = calculateCreditCost(requestedAssets);
    // Our estimatedCredits is only a rough internal display figure and does
    // not match MuAPI's real per-model credit cost, so it must never be used
    // to block generation - only a genuinely empty/near-empty wallet should.
    // MuAPI itself rejects (and we surface) the real per-job cost if a
    // specific generation truly can't be covered.
    const balance = await getMuApiBalance();
    if (balance <= 0) return campaignJson({ error: `Insufficient MuAPI credits. Your balance is ${balance}. Add credits at muapi.ai before generating.` }, { status: 402 });

    const createdJobs = [];
    for (const asset of requestedAssets) {
      try {
        const job = await createGenerationJob({ campaignId, userId: user.userId, workspaceId: user.workspaceId, kind: asset.type, title: asset.title, prompt: asset.prompt, platform: asset.platform, aspectRatio: asset.aspectRatio, duration: asset.duration || null, referenceFile: asset.type === 'video' ? productImage : null, estimatedCredits: asset.estimatedCredits, voiceover: true, music: true, callToAction: campaign.plan?.cta || campaign.brief?.offer, applyBrandKit: campaign.brief?.brandKitApplied !== false, brandPurpose: asset.type === "video" ? "VIDEO" : "IMAGE" });
        if (process.env.NODE_ENV !== 'production' && asset.type === 'video') {
          console.info('Campaign video generation', { requestedAssetType: 'VIDEO', requestedDuration: asset.duration, provider: job.provider || 'MUAPI', model: job.providerModel || null, productImageUsed: Boolean(productImage), descriptionGroundingApplied: Boolean(campaign.brief?.description) });
        }
        createdJobs.push(serializeGenerationJob(job));
      } catch (error) {
        createdJobs.push({ jobId: null, assetId: null, type: asset.type, title: asset.title, status: 'FAILED', progress: 100, prompt: asset.prompt, platform: asset.platform, format: asset.aspectRatio, duration: asset.duration || null, estimatedCredits: asset.estimatedCredits, error: error.message || 'Generation could not be queued.' });
      }
    }

    await saveCampaign({ ...campaign, userId: user.userId, workspaceId: user.workspaceId, status: 'assets_generating', estimatedCredits });
    const remainingCredits = await getMuApiBalance().catch(() => null);
    const responseJobs = await Promise.all(createdJobs.map(async (job) => job.asset ? ({
      ...job,
      asset: {
        ...job.asset,
        outputUrl: await mediaUrlForWorkspace(job.asset.outputUrl, user.workspaceId),
        thumbnailUrl: await mediaUrlForWorkspace(job.asset.thumbnailUrl, user.workspaceId),
      },
    }) : job));
    return campaignJson({ campaignId, jobs: responseJobs, estimatedCredits, remainingCredits }, { status: 202 });
  } catch (error) {
    return campaignJson({ error: error.message || 'Campaign asset generation failed.' }, { status: 500 });
  }
}
