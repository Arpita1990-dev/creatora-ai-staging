import { campaignJson, getAuthenticatedUser, getCampaign, saveCampaign } from '../_lib';

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);
    const { campaignId, stage } = await request.json();
    const campaign = await getCampaign(campaignId, user.workspaceId);
    if (!campaign) return campaignJson({ error: 'Campaign not found.' }, { status: 404 });
    const approvals = { ...campaign.approvals, [stage || 'strategy']: true };
    const status = approvals.assets ? 'assets_confirmed' : approvals.content ? 'content_approved' : approvals.strategy ? 'strategy_approved' : campaign.status;
    const updated = await saveCampaign({ ...campaign, approvals, status, approvedAt: stage === 'strategy' || !stage ? new Date().toISOString() : campaign.approvedAt });
    return campaignJson({ campaign: updated });
  } catch (error) {
    return campaignJson({ error: error.message || 'Campaign approval failed.' }, { status: 500 });
  }
}
