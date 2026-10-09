import { campaignJson, generateStructuredPlan, getAuthenticatedUser, makeCampaignId, normalizeBrief, saveCampaign, validateBrief } from '@/app/api/campaign-agent/_lib';
import { buildBrandContext, buildBrandedPrompt } from '@/lib/brandContext.js';

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await request.json();
    const brief = normalizeBrief(body.brief || body);
    const brandContext = body.applyBrandKit === false || body.brief?.applyBrandKit === false
      ? null
      : await buildBrandContext({ organizationId: user.workspaceId, userId: user.userId, purpose: 'AD' });
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
    const script = plan.videoScripts?.[0];
    const beats = script?.beats?.length ? script.beats : [plan.concept];
    const sceneDuration = Math.max(1, Math.floor(15 / beats.length));
    const structuredPlan = {
      ...plan,
      headline: plan.headlines?.[0] || plan.campaignName,
      script: script?.voiceover || plan.messagingAngle,
      scenes: beats.map((visualPrompt, index) => ({ duration: sceneDuration, visualPrompt, voiceover: index === 0 ? script?.voiceover || plan.messagingAngle : '' })),
      cta: plan.adCopy?.[0]?.callToAction || script?.callToAction || brief.offer,
    };
    const campaign = await saveCampaign({ id: makeCampaignId(), userId: user.userId, workspaceId: user.workspaceId, brief, plan: structuredPlan, source, status: 'strategy_ready', approvals: { strategy: true, content: true, assets: true }, createdAt: new Date().toISOString() });
    return campaignJson({ campaign }, { status: 201 });
  } catch (error) {
    return campaignJson({ error: error.message || 'Campaign creation failed.' }, { status: 500 });
  }
}
