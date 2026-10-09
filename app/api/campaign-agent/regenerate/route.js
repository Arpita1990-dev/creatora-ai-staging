import { campaignJson, generateStructuredPlan, getAuthenticatedUser, getCampaign, normalizeBrief, persistCampaign, saveCampaign, validateBrief } from '../_lib';

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await request.json();
    const existing = body.campaignId ? await getCampaign(body.campaignId, user.workspaceId) : null;
    const brief = normalizeBrief(body.brief || existing?.brief);
    const validation = validateBrief(brief);
    if (!validation.ok) return campaignJson({ status: 'needs_clarification', message: validation.message, missing: validation.missing }, { status: 422 });
    const { plan, source } = await generateStructuredPlan(brief);
    const campaign = await saveCampaign({ ...(existing || { id: body.campaignId || `campaign_${Date.now()}`, createdAt: new Date().toISOString() }), userId: existing?.userId || user.userId, workspaceId: existing?.workspaceId || user.workspaceId, brief, plan, source, status: 'strategy_ready', approvals: { strategy: false, content: false, assets: false } });
    return campaignJson({ campaign });
  } catch (error) {
    return campaignJson({ error: error.message || 'Campaign regeneration failed.' }, { status: 500 });
  }
}
