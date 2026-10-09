import { VIDEO_DURATIONS } from './muapiGeneration.js';

export const CAMPAIGN_VIDEO_MIN_DURATION = 10;
const CAMPAIGN_VIDEO_DURATIONS = [...VIDEO_DURATIONS]
  .filter((duration) => duration >= CAMPAIGN_VIDEO_MIN_DURATION)
  .sort((left, right) => left - right);

export function normalizeCampaignVideoDuration(value) {
  const requested = Math.max(CAMPAIGN_VIDEO_MIN_DURATION, Number(value) || CAMPAIGN_VIDEO_MIN_DURATION);
  return CAMPAIGN_VIDEO_DURATIONS.find((duration) => duration >= requested)
    || CAMPAIGN_VIDEO_DURATIONS.at(-1)
    || CAMPAIGN_VIDEO_MIN_DURATION;
}

export function extractGroundedProductAttributes(description) {
  const seen = new Set();
  return String(description || '')
    .split(/(?:\r?\n|[.;]|,(?=\s))/)
    .map((value) => value.replace(/^[-*\d.)\s]+/, '').replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 3 && value.length <= 280)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function sceneSequence(duration, product, attributes) {
  const details = attributes.length ? attributes : [`the supplied description of ${product}`];
  const groups = [[], [], []];
  details.forEach((attribute, index) => groups[index % groups.length].push(attribute));
  const firstEnd = Math.max(2, Math.round(duration * 0.3));
  const secondEnd = Math.max(firstEnd + 2, Math.round(duration * 0.6));
  const thirdEnd = Math.max(secondEnd + 1, Math.round(duration * 0.82));
  const describe = (group) => group.length ? group.join('; ') : `a grounded view of ${product}`;
  return [
    `0-${firstEnd}s: Establish a recognizable hero view of ${product}, grounded in: ${describe(groups[0])}.`,
    `${firstEnd}-${secondEnd}s: Reveal complementary product details grounded in: ${describe(groups[1])}.`,
    `${secondEnd}-${thirdEnd}s: Show the product in a relevant audience or usage context grounded in: ${describe(groups[2])}.`,
    `${thirdEnd}-${duration}s: Return to a strong, recognizable ${product} hero shot suitable for the campaign call to action.`,
  ];
}

export function buildGroundedCampaignVideoPrompt(asset = {}, brief = {}, plan = {}) {
  const product = String(brief.product || 'the advertised product').trim();
  const description = String(brief.description || '').trim();
  const attributes = extractGroundedProductAttributes(description);
  const duration = normalizeCampaignVideoDuration(asset.duration);
  const referenceInstruction = brief.productImageProvided
    ? 'A product image was supplied in the Campaign Agent. Use it as visual guidance only when an explicitly authorized provider reference is available; otherwise remain grounded in the written description.'
    : 'Keep the product visually consistent across every scene using only details supplied in the campaign brief.';
  const strategy = [plan.concept, plan.positioning, plan.messagingAngle].filter(Boolean).join(' | ');
  const cta = plan.videoScripts?.[0]?.callToAction || plan.adCopy?.[0]?.callToAction || brief.offer || 'end on a clear product hero frame';
  return [
    `SUBJECT: ${product}`,
    `PRODUCT DESCRIPTION - PRIMARY GROUNDING SOURCE: ${description || 'No additional product description supplied.'}`,
    `GROUNDED PRODUCT ATTRIBUTES: ${attributes.join(' | ') || 'Use only the supplied product name and campaign brief.'}`,
    `VISUAL REFERENCE: ${referenceInstruction}`,
    `SCENE SEQUENCE (${duration} seconds):\n${sceneSequence(duration, product, attributes).join('\n')}`,
    `TARGET COUNTRY: ${brief.country || 'Not specified'}`,
    `TARGET AUDIENCE: ${brief.audience || 'Not specified'}`,
    `CAMPAIGN OBJECTIVE: ${brief.objective || 'Not specified'}`,
    `CAMPAIGN STRATEGY: ${strategy || asset.prompt || 'Present the supplied product clearly and professionally.'}`,
    `PLATFORM / FORMAT: ${asset.platform || 'Campaign video'} / ${asset.aspectRatio || asset.format || '9:16'}`,
    `VISUAL STYLE: ${brief.style || 'Professional product advertising'}, coherent lighting, polished commercial cinematography, purposeful camera motion, clean transitions.`,
    `ENDING / CTA: ${cta}`,
    'CONSTRAINTS: Do not invent prices, discounts, specifications, locations, certifications, performance claims, guarantees, features, or other factual selling points not explicitly present in the campaign brief. Do not replace the product with an unrelated subject. Do not add unsupported on-screen claims.',
  ].join('\n\n').slice(0, 5000);
}
