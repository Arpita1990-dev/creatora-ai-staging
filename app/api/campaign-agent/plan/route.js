import { campaignJson, generateStructuredPlan, getAuthenticatedUser, makeCampaignId, normalizeBrief, persistCampaign, saveCampaign, validateBrief } from '../_lib';
import { buildBrandContext, buildBrandedPrompt } from '@/lib/brandContext.js';

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await request.json();
    const brief = normalizeBrief(body.brief);
    const brandContext = body.applyBrandKit === false || body.brief?.applyBrandKit === false
      ? null
      : await buildBrandContext({ organizationId: user.workspaceId, userId: user.userId, purpose: 'CAMPAIGN' });
    if (brandContext) {
      brief.description = buildBrandedPrompt(brief.description, brandContext);
      brief.brandKit = brandContext.brandName;
      brief.brandKitApplied = true;
    } else {
      brief.brandKit = '';
      brief.brandKitApplied = false;
    }
    const validation = validateBrief(brief);
    if (!validation.ok) return campaignJson({ status: 'needs_clarification', message: validation.message, missing: validation.missing }, { status: 422 });
    const { plan, source } = await generateStructuredPlan(brief);
    if (brandContext) brief.brandKitSnapshot = brandContext;
    const campaign = await saveCampaign({ id: makeCampaignId(), userId: user.userId, workspaceId: user.workspaceId, brief, plan, source, status: 'strategy_ready', approvals: { strategy: false, content: false, assets: false }, createdAt: new Date().toISOString() });
    return campaignJson({ campaign });
  } catch (error) {
    return campaignJson({ error: error.message || 'Campaign planning failed.' }, { status: 500 });
  }
}
