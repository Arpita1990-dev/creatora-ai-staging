import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOrganization } from '@/lib/auth';
import { createProjectWithCapacity } from '@/lib/planCatalog';
import { resolveMuApiKey } from '@/lib/providerCredentials';
import { buildGroundedCampaignVideoPrompt, normalizeCampaignVideoDuration } from '@/lib/campaignVideoPrompt';
import { calculateCampaignCreditEstimate, getCampaignCreditEstimate } from '@/lib/campaignCreditEstimate';
export { CAMPAIGN_VIDEO_MIN_DURATION, buildGroundedCampaignVideoPrompt, extractGroundedProductAttributes, normalizeCampaignVideoDuration } from '@/lib/campaignVideoPrompt';
export const calculateCreditCost = calculateCampaignCreditEstimate;
export const getServerCreditCost = getCampaignCreditEstimate;

const MUAPI_BASE = 'https://api.muapi.ai';
const CAMPAIGN_MODELS = {
  image: process.env.MUAPI_CAMPAIGN_IMAGE_MODEL || 'nano-banana',
  video: process.env.MUAPI_CAMPAIGN_VIDEO_MODEL || 'seedance-lite-t2v',
};
const CAMPAIGN_JOB_TIMEOUT_MS = Number(process.env.MUAPI_CAMPAIGN_JOB_TIMEOUT_MS || 15 * 60 * 1000);
const ALLOWED_ENDPOINTS = new Set(Object.values(CAMPAIGN_MODELS).filter(Boolean));

export const campaignPlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['campaignName', 'concept', 'objective', 'audienceSegments', 'messagingAngle', 'positioning', 'platformRecommendations', 'headlines', 'adCopy', 'socialCaptions', 'hashtags', 'videoScripts', 'publishingCalendar', 'assetRecommendations'],
  properties: {
    campaignName: { type: 'string' },
    concept: { type: 'string' },
    objective: { type: 'string' },
    audienceSegments: { type: 'array', items: { type: 'string' } },
    messagingAngle: { type: 'string' },
    positioning: { type: 'string' },
    platformRecommendations: { type: 'array', items: { type: 'string' } },
    headlines: { type: 'array', items: { type: 'string' } },
    adCopy: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'primaryText', 'headline', 'callToAction'],
        properties: {
          platform: { type: 'string' },
          primaryText: { type: 'string' },
          headline: { type: 'string' },
          callToAction: { type: 'string' },
        },
      },
    },
    socialCaptions: { type: 'array', items: { type: 'string' } },
    hashtags: { type: 'array', items: { type: 'string' } },
    videoScripts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['format', 'hook', 'beats', 'voiceover', 'callToAction'],
        properties: {
          format: { type: 'string' },
          hook: { type: 'string' },
          beats: { type: 'array', items: { type: 'string' } },
          voiceover: { type: 'string' },
          callToAction: { type: 'string' },
        },
      },
    },
    publishingCalendar: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'activity', 'channel'],
        properties: {
          day: { type: 'string' },
          activity: { type: 'string' },
          channel: { type: 'string' },
        },
      },
    },
    assetRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'title', 'platform', 'format', 'aspectRatio', 'duration', 'prompt', 'estimatedCredits'],
        properties: {
          type: { type: 'string' },
          id: { type: 'string' },
          title: { type: 'string' },
          platform: { type: 'string' },
          format: { type: 'string' },
          aspectRatio: { type: 'string' },
          duration: { type: 'number' },
          prompt: { type: 'string' },
          estimatedCredits: { type: 'number' },
        },
      },
    },
  },
};

export function campaignJson(data, init) {
  return NextResponse.json(data, init);
}

export function makeCampaignId() {
  return `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeJobId(type) {
  return `job_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function makeAssetId(type) {
  return `asset_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function getAuthenticatedUser(request) {
  const { user } = await requireOrganization(request);
  return { userId: user.sub, workspaceId: user.organizationId };
}

function campaignFromRecord(record) {
  let content = {};
  try { content = JSON.parse(record.contentPlan || '{}'); } catch {}
  return { id: record.id, userId: content.userId || record.createdById, workspaceId: content.workspaceId || record.organizationId, brief: content.brief || {}, plan: content.plan || {}, source: content.source || 'database', approvals: content.approvals || {}, status: content.localStatus || record.status.toLowerCase(), estimatedCredits: content.estimatedCredits || 0, approvedAt: content.approvedAt || null, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}

function jobFromRecord(record) {
  let details = {};
  try { details = JSON.parse(record.requestPayload || '{}'); } catch {}
  return { jobId: record.id, campaignId: record.campaignId, assetId: record.assetId, userId: record.userId, workspaceId: record.organizationId, provider: record.provider, type: record.type.toLowerCase(), title: details.title, model: record.providerModel, prompt: record.prompt, platform: details.platform, aspectRatio: record.aspectRatio, duration: record.durationSeconds, status: record.status, stage: details.stage || record.status, progressMessage: details.progressMessage || null, progress: record.progress, estimatedCredits: record.estimatedCredits, actualCredits: record.chargedCredits, creditsCharged: record.chargedCredits, error: record.errorMessage, providerRequestId: record.providerJobId, providerStatus: record.providerStatus, mock: details.mock, providerResponse: details.providerResponse, lastStatusError: details.lastStatusError, startedAt: record.startedAt?.toISOString(), completedAt: record.completedAt?.toISOString(), createdAt: record.createdAt.toISOString() };
}

function assetFromRecord(record, jobId = null) {
  let platforms = [];
  try { platforms = JSON.parse(record.platforms || '[]'); } catch {}
  return { assetId: record.id, campaignId: record.campaignId, jobId, userId: record.userId, workspaceId: record.organizationId, title: record.title, type: record.assetType.toLowerCase(), status: record.status, prompt: record.prompt, platform: platforms.join(', '), format: record.aspectRatio, duration: record.durationSeconds, provider: record.provider, providerJobId: record.providerJobId, providerStatus: record.providerStatus, outputUrl: record.outputUrl, url: record.outputUrl, thumbnailUrl: record.thumbnailUrl, errorMessage: record.errorMessage, estimatedCredits: record.estimatedCredits, chargedCredits: record.chargedCredits, startedAt: record.startedAt?.toISOString(), completedAt: record.completedAt?.toISOString(), createdAt: record.createdAt.toISOString() };
}

export async function getCampaign(id, workspaceId) {
  const record = workspaceId
    ? await prisma.campaign.findFirst({ where: { id, organizationId: workspaceId } })
    : await prisma.campaign.findUnique({ where: { id } });
  return record ? campaignFromRecord(record) : null;
}

export async function saveCampaign(campaign) {
  const next = { ...campaign, updatedAt: new Date().toISOString() };
  await persistCampaign(next);
  return next;
}

export async function getCampaignJobs(campaignId) {
  return (await prisma.generationJob.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } })).map(jobFromRecord);
}

export async function getCampaignAssets(campaignId) {
  return (await prisma.asset.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } })).map((asset) => assetFromRecord(asset));
}

export async function getCampaignAssetByJob(jobId) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job?.assetId) return null;
  const asset = await prisma.asset.findUnique({ where: { id: job.assetId } });
  return asset ? assetFromRecord(asset, jobId) : null;
}

export async function saveJob(job) {
  const next = { ...job, updatedAt: new Date().toISOString() };
  await persistGenerationJob(next);
  return next;
}

export async function saveAsset(asset) {
  const next = { ...asset, updatedAt: new Date().toISOString() };
  await prisma.asset.update({ where: { id: asset.assetId }, data: { status: asset.status, providerStatus: asset.providerStatus, outputUrl: asset.outputUrl || asset.url || undefined, thumbnailUrl: asset.thumbnailUrl || undefined, errorMessage: asset.errorMessage || undefined, chargedCredits: asset.chargedCredits || 0, completedAt: asset.completedAt ? new Date(asset.completedAt) : undefined } });
  return next;
}

export function validateBrief(brief = {}) {
  const missing = [];
  if (!brief.product?.trim()) missing.push('Product');
  if (!brief.description?.trim()) missing.push('Product description');
  if (!brief.country?.trim()) missing.push('Target country');
  if (!brief.audience?.trim()) missing.push('Target audience');
  if (!brief.objective?.trim()) missing.push('Objective');
  if (!brief.offer?.trim()) missing.push('Offer');
  if (!brief.platforms?.trim()) missing.push('Platforms');
  if (missing.length) return { ok: false, message: `Please complete: ${missing.join(', ')}.`, missing };
  if (brief.country.trim().toLowerCase() === 'india' && brief.audience.trim().toLowerCase() === 'indian') {
    return { ok: false, message: 'Which Indian audience are you targeting - entrepreneurs, ecommerce sellers, marketers or general consumers?', missing: ['Specific target audience'] };
  }
  return { ok: true, missing: [] };
}

export function normalizeBrief(input = {}) {
  return {
    product: String(input.product || '').trim(),
    description: String(input.description || '').trim(),
    country: String(input.country || 'India').trim(),
    audience: String(input.audience || '').trim(),
    objective: String(input.objective || '').trim(),
    offer: String(input.offer || '').trim(),
    platforms: String(input.platforms || '').trim(),
    brandKit: String(input.brandKit || input.brand || 'Workspace brand kit').trim(),
    duration: String(input.duration || '14 days').trim(),
    style: String(input.style || 'Premium educational').trim(),
    budget: String(input.budget || '').trim(),
    productImageProvided: Boolean(input.productImageProvided),
  };
}

export function fallbackPlan(brief) {
  const isPromptProduct = /prompt|ebook|playbook/i.test(`${brief.product} ${brief.description}`);
  const campaignName = isPromptProduct ? 'The AI Ad Prompt Advantage' : `${brief.product.replace(/\s+launch$/i, '')} Advantage`;
  const country = brief.country || 'India';
  return {
    campaignName,
    concept: `Show ${brief.audience} moving from creative uncertainty to a faster, structured campaign process with ${brief.product}. The story should contrast blank-page frustration with confident product-ad execution using the offer: ${brief.offer}.`,
    objective: brief.objective,
    audienceSegments: [`${country} ecommerce sellers`, `${country} small-business owners`, 'Digital marketers', 'Freelancers', 'Social media managers', 'Content creators'],
    messagingAngle: 'Never start an advertisement from a blank page. Use proven prompt structures to move from product information to creative advertising concepts faster.',
    positioning: `${brief.product} is positioned as a practical launch tool for operators who need more consistent product marketing without hiring a full creative team.`,
    platformRecommendations: brief.platforms.split(',').map((item) => `${item.trim()}: use direct benefit-led copy, product proof and offer urgency.`),
    headlines: ['200 AI Prompts. Endless Product Ad Ideas.', 'Never Start Your Next Advertisement from Scratch.', 'Turn Product Details into Scroll-Stopping Ad Concepts.', 'Your AI Product-Marketing Prompt Library.'],
    adCopy: [{ platform: 'Meta', primaryText: `Running out of product advertising ideas? ${brief.product} gives entrepreneurs, ecommerce sellers and marketers 200 ready-to-use ChatGPT prompts for creating headlines, campaign concepts, social posts and product-ad ideas. Launch offer: ${brief.offer}.`, headline: '200 Prompts for Better Ads', callToAction: 'Download Now' }],
    socialCaptions: [`Better product advertising starts with a better prompt. Explore structured ChatGPT prompts created for ecommerce sellers, entrepreneurs and marketers. ${brief.offer}.`],
    hashtags: ['#AIForBusiness', '#ChatGPTPrompts', '#DigitalMarketing', `#Ecommerce${country.replace(/\s+/g, '')}`, '#ProductMarketing', '#SmallBusiness'],
    videoScripts: [{ format: '15-second Reel', hook: 'Still starting every product ad from scratch?', beats: ['Show blank ad document', 'Reveal the prompt playbook', 'Generate headline and creative angles', 'End with launch offer'], voiceover: 'Stop guessing your next product ad. Use 200 structured AI prompts to build campaign ideas faster.', callToAction: 'Download the launch edition' }],
    publishingCalendar: ['Problem-awareness teaser', 'Ebook reveal', 'Sample prompt carousel', 'Product-ad transformation reel', 'Benefits and use cases', 'Creator demonstration', 'Offer reminder', 'Final launch-offer advertisement'].map((activity, index) => ({ day: `Day ${[1, 2, 4, 6, 8, 10, 12, 14][index]}`, activity, channel: index % 2 ? 'Instagram + Meta' : 'Meta + LinkedIn' })),
    assetRecommendations: buildAssetRecommendations(brief),
  };
}

export function buildAssetRecommendations(brief) {
  return [
    { id: 'asset_01', type: 'image', title: 'Product Advertisement Image', platform: 'Instagram', format: '4:5', aspectRatio: '4:5', duration: 0, prompt: `Premium ${brief.product} advertisement for ${brief.audience}; show the product clearly, strong headline space, launch offer ${brief.offer}.`, estimatedCredits: 10 },
    { id: 'asset_02', type: 'video', title: 'Promotional Reel', platform: 'Instagram Reel', format: '9:16', aspectRatio: '9:16', duration: 15, prompt: buildGroundedCampaignVideoPrompt({}, brief), estimatedCredits: null },
  ];
}

export function normalizeAssetRecommendation(input, index = 0) {
  const label = String(input.type || input.title || '').toLowerCase();
  const type = label.includes('video') || label.includes('reel') ? 'video' : label.includes('voice') || label.includes('audio') ? 'audio' : 'image';
  const quantity = Math.max(1, Math.min(3, Number(input.quantity || 1)));
  const platform = input.platform || (type === 'video' ? 'Instagram Reel' : 'Instagram');
  const aspectRatio = normalizeAspectRatio(input.aspectRatio || input.format, type);
  const title = input.title || String(input.type || `${type} asset`).replace(/^./, (char) => char.toUpperCase());
  const endpoint = getCampaignEndpoint(type);
  return {
    id: input.id || `asset_${String(index + 1).padStart(2, '0')}`,
    type,
    title,
    prompt: input.prompt || `Create a ${platform} ${title} for this campaign.`,
    platform,
    aspectRatio,
    format: input.format || aspectRatio,
    duration: type === 'video' ? normalizeCampaignVideoDuration(input.duration) : undefined,
    model: endpoint,
    estimatedCredits: getServerCreditCost({ type }) == null ? null : getServerCreditCost({ type }) * quantity,
    quantity,
  };
}

export function getCampaignEndpoint(type) {
  const endpoint = CAMPAIGN_MODELS[type];
  if (!endpoint) throw new Error(`Unsupported campaign asset type: ${type}`);
  if (!ALLOWED_ENDPOINTS.has(endpoint)) throw new Error(`Invalid MuAPI endpoint: ${endpoint}`);
  return endpoint;
}

function normalizeAspectRatio(value, type) {
  const text = String(value || '').toLowerCase();
  if (type === 'video' && (text.includes('16:9') || text.includes('landscape'))) return '16:9';
  if (type === 'video') return '9:16';
  if (text.includes('9:16') || text.includes('vertical') || text.includes('story') || text.includes('reel')) return '9:16';
  if (text.includes('16:9') || text.includes('landscape')) return '16:9';
  if (text.includes('1.91')) return '1.91:1';
  if (text.includes('1:1') || text.includes('square')) return '1:1';
  if (text.includes('4:5') || text.includes('portrait')) return '4:5';
  return type === 'video' ? '9:16' : '4:5';
}

export function expandGenerationAssets(recommendations = []) {
  return recommendations.flatMap((recommendation, index) => {
    const normalized = normalizeAssetRecommendation(recommendation, index);
    return Array.from({ length: normalized.quantity }, (_, itemIndex) => ({
      ...normalized,
      id: normalized.quantity > 1 ? `${normalized.id}_${itemIndex + 1}` : normalized.id,
      title: normalized.quantity > 1 ? `${normalized.title} ${itemIndex + 1}` : normalized.title,
      estimatedCredits: Math.ceil(normalized.estimatedCredits / normalized.quantity),
      quantity: 1,
    }));
  });
}

export function buildCampaignAssetPackage(recommendations = [], brief, plan = {}) {
  const expanded = expandGenerationAssets(recommendations.length ? recommendations : buildAssetRecommendations(brief));
  const image = expanded.find((asset) => asset.type === 'image');
  const video = expanded.find((asset) => asset.type === 'video');
  const fallback = expandGenerationAssets(buildAssetRecommendations(brief));
  const selected = [image || fallback.find((asset) => asset.type === 'image'), video || fallback.find((asset) => asset.type === 'video')].filter(Boolean);
  return selected.map((asset) => asset.type === 'video'
    ? { ...asset, duration: normalizeCampaignVideoDuration(asset.duration), prompt: buildGroundedCampaignVideoPrompt(asset, brief, plan) }
    : asset);
}

export async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { detail: text }; }
}

export function getOutputUrl(result) {
  const urls = [];
  const visit = (value) => {
    if (!value) return;
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) { urls.push(value); return; }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(result);
  return urls.find((url) => /\.mp4(?:$|\?)/i.test(url))
    || urls.find((url) => !/thumbnail|preview|poster|first_frame/i.test(url))
    || urls[0]
    || null;
}

export function getThumbnailUrl(result) {
  return result?.thumbnail_url || result?.thumbnailUrl || result?.data?.thumbnail_url || result?.data?.thumbnailUrl || getOutputUrl(result);
}

export async function submitMuapiJob(asset) {
  if (!asset.workspaceId || !asset.userId) throw new Error('Workspace membership is required for MuAPI generation.');
  const apiKey = await resolveMuApiKey(prisma, asset.workspaceId, asset.userId);
  const endpoint = getCampaignEndpoint(asset.type);
  const payload = buildMuApiPayload(asset);
  const response = await fetch(`${MUAPI_BASE}/api/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  let data = {};
  try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = { detail: responseText }; }
  if (!response.ok) {
    console.error('MuAPI generation failed', { endpoint, status: response.status, response: responseText });
    throw new Error(formatProviderError(data.detail || data.error) || `MuAPI rejected ${asset.title} (${response.status})`);
  }
  const providerRequestId = data.request_id || data.id || data.task_id;
  if (asset.type === 'video') {
    console.error('MuAPI video response', { endpoint, taskId: providerRequestId, payload, response: data });
  }
  return { providerRequestId, status: 'queued', result: data };
}

function formatProviderError(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

export function buildMuApiPayload(asset) {
  const payload = { prompt: asset.prompt, aspect_ratio: asset.aspectRatio };
  if (asset.type === 'video') payload.duration = normalizeCampaignVideoDuration(asset.duration);
  return payload;
}

export async function refreshCampaignJobs(campaign) {
  const apiKey = await resolveMuApiKey(prisma, campaign.workspaceId, campaign.userId);
  const campaignJobs = await getCampaignJobs(campaign.id);
  const now = Date.now();
  const refreshed = [];
  for (const job of campaignJobs) {
    if (['COMPLETED', 'FAILED'].includes(job.status)) { refreshed.push(job); continue; }
    const age = now - new Date(job.startedAt || job.createdAt).getTime();
    if (age > CAMPAIGN_JOB_TIMEOUT_MS) {
      const error = 'Generation is taking longer than expected. The job was stopped after the campaign polling limit.';
      await updatePrismaAssetStatus(job.providerRequestId, 'FAILED', 'timed_out', null, null, error);
      const updated = await saveJob({ ...job, status: 'FAILED', progress: null, error, completedAt: new Date().toISOString() });
      const asset = await getCampaignAssetByJob(job.jobId);
      if (asset) await saveAsset({ ...asset, status: 'FAILED', errorMessage: error, completedAt: updated.completedAt });
      refreshed.push(updated);
      continue;
    }
    if (job.mock || !apiKey || !job.providerRequestId) {
      const status = age > 12000 ? 'COMPLETED' : age > 4000 ? 'PROCESSING' : 'QUEUED';
      const progress = status === 'COMPLETED' ? 100 : status === 'PROCESSING' ? Math.min(90, 35 + Math.floor(age / 220)) : 5;
      const updated = await saveJob({ ...job, status, providerStatus: status.toLowerCase(), progress, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null });
      if (status === 'COMPLETED') {
        await saveCompletedAsset(campaign, updated, placeholderUrl(updated));
      } else {
        const asset = await getCampaignAssetByJob(job.jobId);
        if (asset) await saveAsset({ ...asset, status, providerStatus: status.toLowerCase() });
      }
      refreshed.push(updated);
      continue;
    }
    const response = await fetch(`${MUAPI_BASE}/api/v1/predictions/${job.providerRequestId}/result`, { headers: { 'x-api-key': apiKey }, cache: 'no-store' });
    const data = await readJson(response);
    if (!response.ok) {
      const responseStatus = String(data.status || data.detail?.status || '').toLowerCase();
      if (['failed', 'error', 'cancelled', 'canceled'].includes(responseStatus)) {
        const error = formatProviderError(data.error || data.detail?.error || data.detail || data.message) || 'MuAPI generation failed';
        await updatePrismaAssetStatus(job.providerRequestId, 'FAILED', responseStatus, null, null, error);
        const updated = await saveJob({ ...job, status: 'FAILED', providerStatus: responseStatus, progress: null, error, completedAt: new Date().toISOString() });
        const asset = await getCampaignAssetByJob(job.jobId);
        if (asset) await saveAsset({ ...asset, status: 'FAILED', providerStatus: responseStatus, errorMessage: error, completedAt: updated.completedAt });
        refreshed.push(updated);
        continue;
      }
      refreshed.push(await saveJob({ ...job, status: 'PROCESSING', progress: null, lastStatusError: formatProviderError(data.detail || data.error || data.message), statusCheckFailures: (job.statusCheckFailures || 0) + 1 }));
      continue;
    }
    const statusText = String(data.status || '').toLowerCase();
    if (['completed', 'succeeded', 'success'].includes(statusText)) {
      const creditsCharged = Number(data.cost?.amount_credits || job.estimatedCredits);
      const outputUrl = getOutputUrl(data);
      const thumbnailUrl = getThumbnailUrl(data);
      await updatePrismaAssetStatus(job.providerRequestId, 'COMPLETED', statusText, outputUrl, thumbnailUrl);
      const updated = await saveJob({ ...job, status: 'COMPLETED', providerStatus: statusText, progress: 100, outputUrl, thumbnailUrl, actualCredits: creditsCharged, creditsCharged, completedAt: new Date().toISOString() });
      await saveCompletedAsset(campaign, updated, outputUrl, thumbnailUrl);
      refreshed.push(updated);
    } else if (['failed', 'error', 'cancelled', 'canceled'].includes(statusText)) {
      const error = formatProviderError(data.error?.message || data.error || data.message) || 'MuAPI generation failed';
      await updatePrismaAssetStatus(job.providerRequestId, 'FAILED', statusText, null, null, error);
      const updated = await saveJob({ ...job, status: 'FAILED', providerStatus: statusText, progress: null, error, completedAt: new Date().toISOString() });
      const asset = await getCampaignAssetByJob(job.jobId);
      if (asset) await saveAsset({ ...asset, status: 'FAILED', providerStatus: statusText, errorMessage: error, completedAt: updated.completedAt });
      refreshed.push(updated);
    } else {
      const providerProgress = Number(data.progress ?? data.percent ?? data.percentage);
      const progress = Number.isFinite(providerProgress) ? Math.max(0, Math.min(99, providerProgress)) : null;
      await updatePrismaAssetStatus(job.providerRequestId, 'PROCESSING', statusText || 'processing');
      const updated = await saveJob({ ...job, status: 'PROCESSING', providerStatus: statusText || 'processing', progress, lastStatusError: null });
      const asset = await getCampaignAssetByJob(job.jobId);
      if (asset) await saveAsset({ ...asset, status: 'PROCESSING', providerStatus: statusText || 'processing' });
      refreshed.push(updated);
    }
  }
  const finalJobs = await getCampaignJobs(campaign.id);
  const completed = finalJobs.filter((job) => job.status === 'COMPLETED').length;
  const failed = finalJobs.filter((job) => job.status === 'FAILED').length;
  const nextStatus = finalJobs.length && completed + failed === finalJobs.length ? 'assets_completed' : finalJobs.length ? 'assets_generating' : campaign.status;
  await Promise.all(finalJobs.map((job) => persistGenerationJob(job)));
  await saveCampaign({ ...campaign, status: nextStatus, jobs: finalJobs });
  return finalJobs;
}

async function updatePrismaAssetStatus(providerJobId, status, providerStatus, outputUrl, thumbnailUrl, errorMessage) {
  await prisma.asset.update({
    where: { providerJobId },
    data: {
      status,
      providerStatus,
      outputUrl: outputUrl ?? undefined,
      thumbnailUrl: thumbnailUrl ?? undefined,
      errorMessage: errorMessage ?? undefined,
      completedAt: ['COMPLETED', 'FAILED'].includes(status) ? new Date() : undefined,
    },
  });
}

export async function saveCompletedAsset(campaign, job, url, thumbnailUrl = url) {
  if (!url) return null;
  const existing = (await getCampaignAssets(campaign.id)).find((asset) => asset.jobId === job.jobId);
  return saveAsset({
    ...(existing || {}),
    assetId: existing?.assetId || makeAssetId(job.type),
    campaignId: campaign.id,
    jobId: job.jobId,
    type: job.type,
    url,
    outputUrl: url,
    thumbnailUrl,
    platform: job.platform,
    format: job.aspectRatio,
    duration: job.duration || null,
    status: 'COMPLETED',
    provider: 'MUAPI',
    providerJobId: job.providerRequestId,
    providerStatus: job.providerStatus,
    chargedCredits: job.creditsCharged || job.actualCredits || job.estimatedCredits,
    completedAt: job.completedAt || new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  });
}

function placeholderUrl(job) {
  if (job.type === 'video') return '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><rect width="1200" height="1500" fill="#141415"/><rect x="95" y="100" width="1010" height="1300" rx="54" fill="#ff5a36"/><rect x="160" y="175" width="880" height="1170" rx="38" fill="#101011"/><text x="600" y="640" fill="#ffffff" text-anchor="middle" font-family="Arial" font-size="72" font-weight="700">${escapeXml(job.title)}</text><text x="600" y="750" fill="#ffb74d" text-anchor="middle" font-family="Arial" font-size="42">${escapeXml(job.platform)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(value = '') {
  return String(value).replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]));
}

async function persistRecord(table, record) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  try {
    await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(record),
    });
  } catch {
  }
}

async function persistPrismaAsset(asset) {
  try {
    const repository = await import('@/lib/assetRepository');
    await repository.createAssetRecord(asset);
  } catch {
  }
}

function toCampaignRecord(campaign) {
  return { campaign_id: campaign.id, user_id: campaign.userId, workspace_id: campaign.workspaceId, product_name: campaign.brief?.product, brief: campaign.brief, strategy: campaign.plan, content_plan: campaign.plan, status: campaign.status, approved_at: campaign.approvedAt, created_at: campaign.createdAt, updated_at: campaign.updatedAt };
}

function toJobRecord(job) {
  return { job_id: job.jobId, campaign_id: job.campaignId, provider: job.provider, provider_request_id: job.providerRequestId, type: job.type, model: job.model, prompt: job.prompt, status: job.status, estimated_credits: job.estimatedCredits, actual_credits: job.actualCredits, error: job.error, created_at: job.createdAt, completed_at: job.completedAt };
}

function toAssetRecord(asset) {
  return { asset_id: asset.assetId, campaign_id: asset.campaignId, job_id: asset.jobId, type: asset.type, url: asset.url || asset.outputUrl, thumbnail_url: asset.thumbnailUrl, platform: asset.platform, format: asset.format, duration: asset.duration, status: asset.status, created_at: asset.createdAt, completed_at: asset.completedAt };
}

function parseOpenAIOutput(data) {
  if (data.output_text) return JSON.parse(data.output_text);
  const text = data.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
  if (text) return JSON.parse(text);
  throw new Error('OpenAI returned no structured campaign plan.');
}

export async function generateStructuredPlan(brief) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { plan: fallbackPlan(brief), source: 'local-fallback' };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_CAMPAIGN_MODEL || 'gpt-4.1-mini',
      input: [
        { role: 'system', content: 'You are Creatora Campaign Strategist Agent. Generate professional campaign strategy and structured content only. Do not mention secrets or internal tools.' },
        { role: 'user', content: JSON.stringify({ brief, instructions: 'Return a complete campaign plan for Creatora. Prepare practical image/video prompt recommendations for MuAPI, but do not call MuAPI.' }) },
      ],
      text: { format: { type: 'json_schema', name: 'creatora_campaign_plan', strict: true, schema: campaignPlanSchema } },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `OpenAI campaign planning failed (${response.status})`);
  return { plan: parseOpenAIOutput(data), source: 'openai-responses' };
}

function campaignStatus(status) {
  if (status === 'assets_generating') return 'GENERATING';
  if (status === 'assets_completed') return 'COMPLETED';
  if (status?.includes('approved')) return 'REVIEW';
  return 'PLANNING';
}

export async function persistCampaign(campaign) {
  const content = JSON.stringify({ brief: campaign.brief, plan: campaign.plan, source: campaign.source, approvals: campaign.approvals, localStatus: campaign.status, estimatedCredits: campaign.estimatedCredits, workspaceId: campaign.workspaceId, userId: campaign.userId, approvedAt: campaign.approvedAt });
  const existing = await prisma.campaign.findUnique({ where: { id: campaign.id }, select: { projectId: true } });
  let projectId = existing?.projectId;
  if (!projectId) {
    const project = await createProjectWithCapacity(prisma, campaign.workspaceId, {
        id: `campaign_project_${crypto.randomUUID()}`,
        organizationId: campaign.workspaceId,
        createdById: campaign.userId,
        name: campaign.plan?.campaignName || campaign.brief?.product || 'Untitled campaign',
        description: campaign.brief?.description || null,
        prompt: campaign.plan?.concept || campaign.brief?.description || null,
        configuration: JSON.stringify({ source: 'CAMPAIGN_AGENT', campaignId: campaign.id }),
        inputMethod: 'CAMPAIGN',
        platform: String(campaign.brief?.platforms || '').split(',')[0]?.trim() || null,
        outputType: 'CAMPAIGN',
        status: 'IN_PROGRESS',
      });
    projectId = project.id;
  }
  await prisma.campaign.upsert({
    where: { id: campaign.id },
    create: { id: campaign.id, organizationId: campaign.workspaceId, projectId, createdById: campaign.userId, name: campaign.plan?.campaignName || campaign.brief?.product || 'Untitled campaign', productName: campaign.brief?.product || null, productDescription: campaign.brief?.description || null, targetAudience: campaign.brief?.audience || null, objective: campaign.brief?.objective || null, offer: campaign.brief?.offer || null, platforms: JSON.stringify(String(campaign.brief?.platforms || '').split(',').map((item) => item.trim()).filter(Boolean)), contentPlan: content, status: campaignStatus(campaign.status) },
    update: { projectId, name: campaign.plan?.campaignName || campaign.brief?.product || 'Untitled campaign', productName: campaign.brief?.product || null, productDescription: campaign.brief?.description || null, targetAudience: campaign.brief?.audience || null, objective: campaign.brief?.objective || null, offer: campaign.brief?.offer || null, contentPlan: content, status: campaignStatus(campaign.status) },
  });
}

export async function persistGenerationJob(job) {
  const payload = JSON.stringify({ title: job.title, model: job.model, platform: job.platform, mock: job.mock, providerResponse: job.providerResponse, lastStatusError: job.lastStatusError });
  await prisma.generationJob.upsert({
    where: { id: job.jobId },
    create: { id: job.jobId, organizationId: job.workspaceId || 'local-workspace', userId: job.userId || 'local-user', campaignId: job.campaignId, assetId: job.assetId || null, type: String(job.type || 'image').toUpperCase(), status: job.status, provider: job.provider || 'MUAPI', providerModel: job.model || null, providerEndpoint: job.model || null, providerJobId: job.providerRequestId || null, providerStatus: job.providerStatus || null, prompt: job.prompt || null, requestPayload: payload, aspectRatio: job.aspectRatio || null, durationSeconds: job.duration || null, progress: job.progress, errorMessage: job.error || job.lastStatusError || null, estimatedCredits: job.estimatedCredits || 0, chargedCredits: job.creditsCharged || job.actualCredits || 0, startedAt: job.startedAt ? new Date(job.startedAt) : null, completedAt: job.completedAt ? new Date(job.completedAt) : null, createdAt: job.createdAt ? new Date(job.createdAt) : undefined },
    update: { status: job.status, providerJobId: job.providerRequestId || null, providerStatus: job.providerStatus || null, responsePayload: job.providerResponse ? JSON.stringify(job.providerResponse) : undefined, progress: job.progress, errorMessage: job.error || job.lastStatusError || null, chargedCredits: job.creditsCharged || job.actualCredits || 0, startedAt: job.startedAt ? new Date(job.startedAt) : undefined, completedAt: job.completedAt ? new Date(job.completedAt) : undefined },
  });
}

export async function loadPersistedCampaign(id) {
  return getCampaign(id);
}
