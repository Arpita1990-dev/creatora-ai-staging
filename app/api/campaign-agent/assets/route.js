import { buildCampaignAssetPackage, calculateCreditCost, campaignJson, getAuthenticatedUser, getCampaign, saveCampaign } from '../_lib';

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);
    const { campaignId, confirm } = await request.json();
    const campaign = await getCampaign(campaignId, user.workspaceId);
    if (!campaign) return campaignJson({ error: 'Campaign not found.' }, { status: 404 });
    const recommendations = buildCampaignAssetPackage(campaign.plan.assetRecommendations, campaign.brief, campaign.plan);
    const estimatedCredits = calculateCreditCost(recommendations);
    const next = confirm ? await saveCampaign({ ...campaign, assets: recommendations, estimatedCredits, approvals: { ...campaign.approvals, assets: true }, status: 'assets_confirmed' }) : campaign;
    return campaignJson({ campaign: next, assetRecommendations: recommendations, estimatedCredits, tools: ['generateProductImage', 'generateAdCreative', 'generateCampaignVideo', 'generateVoiceover', 'calculateCreditCost', 'saveAsset'] });
  } catch (error) {
    return campaignJson({ error: error.message || 'Asset recommendation failed.' }, { status: 500 });
  }
}
