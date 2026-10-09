import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "./prisma.js";
import { downloadRemoteToTempFile, loadLocalFile, storeLocalFile, uploadLocalFile } from "./storage.js";
import { providerRouter } from "./providers/providerRouter.js";
import { isRetryableProviderError } from "./providers/providerError.js";
import { PROVIDER_TASK_STATUS } from "./providers/videoProvider.js";
import { ffmpegRenderer } from "./rendering/ffmpegRenderer.js";
import { enqueueGenerationJob } from "./generationQueue.js";
import { publicErrorMessage } from "./publicErrors.js";
import { assertGenerationEntitlement, assertGenerationQuota, workspaceEntitlements } from "./planCatalog.js";
import { resolveMuApiKey } from "./providerCredentials.js";
import { OpenAiTtsProvider } from "./tts/openaiProvider.js";
import { MuApiTtsProvider } from "./tts/muapiProvider.js";
import { getStockAvatar } from "./avatar/avatars.js";
import { buildBrandContext, buildBrandedPrompt, resolveBrandLogoPath, selectBrandContext } from "./brandContext.js";
import { mediaUrlForWorkspace } from "./mediaDelivery.js";

const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const audioDurations = new Set([5, 8, 10, 12, 15, 20, 30]);
const safeJson = (value, fallback = {}) => { try { return JSON.parse(value || "{}"); } catch { return fallback; } };
const kindFor = (job) => job.type === "VIDEO" ? "video" : job.type === "AUDIO" ? "audio" : "image";
// The asset id disambiguates multiple videos in one project while retaining
// the required project + asset type + attempt structure.
const attemptKey = (job, providerName, number) => `${job.projectId || job.campaignId || job.id}:${kindFor(job)}:${job.assetId || job.id}:${providerName.toLowerCase()}:${number}`;

function percent(value, fallback = null) {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  const number = Number(value);
  return Math.max(0, Math.min(100, Math.round(number <= 1 ? number * 100 : number)));
}

export function fallbackEligible(error) {
  const message = String(error?.message || error || "");
  if (/invalid prompt|prompt is required|file.*(type|large)|unsupported file|validation/i.test(message)) return false;
  return isRetryableProviderError(error) || /unsupported (field|parameter|model|input)|generation failed|internal|timeout|rate.?limit|outage|(?:credits?|balance).*(?:insufficient|not enough)|(?:insufficient|not enough).*(?:credits?|balance)/i.test(message);
}

export const skipPrimaryRetry = (error) => /unsupported (field|parameter|model|input)|invalid (field|parameter)|(?:credits?|balance).*(?:insufficient|not enough)|(?:insufficient|not enough).*(?:credits?|balance)/i.test(String(error?.message || error || ""));

export function serializeGenerationJob(job) {
  if (!job) return null;
  const request = safeJson(job.requestPayload);
  const response = safeJson(job.responsePayload);
  return { id: job.id, jobId: job.id, campaignId: job.campaignId, projectId: job.projectId, assetId: job.assetId, type: job.type, status: job.status, progress: job.progress, stage: request.stage || job.status, progressMessage: request.progressMessage || null, prompt: job.prompt, platform: request.platform || "", format: job.aspectRatio, duration: job.durationSeconds, chargedCredits: job.chargedCredits || 0, error: job.status === "FAILED" ? publicErrorMessage(job.errorMessage, "Generation failed. Please try again.") : null, retryCount: job.retryCount, fallbackCount: job.fallbackCount || 0, createdAt: job.createdAt, updatedAt: job.updatedAt, asset: job.assetId ? { id: job.assetId, assetType: job.type, status: job.status === "COMPLETED" ? "COMPLETED" : job.status === "FAILED" ? "FAILED" : "PROCESSING", storageUrl: response.url || null, outputUrl: response.url || null, thumbnailUrl: response.thumbnailUrl || null, duration: job.durationSeconds, platform: request.platform || "", format: job.aspectRatio } : null };
}

export async function serializeGenerationJobForWorkspace(job, workspaceId) {
  const serialized = serializeGenerationJob(job);
  if (!serialized?.asset) return serialized;
  return {
    ...serialized,
    asset: {
      ...serialized.asset,
      outputUrl: await mediaUrlForWorkspace(serialized.asset.outputUrl, workspaceId),
      thumbnailUrl: await mediaUrlForWorkspace(serialized.asset.thumbnailUrl, workspaceId),
    },
  };
}

function validateInput(input, kind) {
  if (!String(input.prompt || "").trim()) throw new Error("A prompt is required.");
  if (input.referenceFile && input.referenceFile.size > 10 * 1024 * 1024) throw new Error("Reference images must be 10MB or smaller.");
  if (input.referenceFile?.type && !["image/jpeg", "image/png", "image/webp"].includes(input.referenceFile.type)) throw new Error("Reference images must be JPG, PNG, or WebP.");
  if (kind === "video" && ![5, 10, 15, 30].includes(Number(input.duration || 5))) throw new Error("Video duration must be 5, 10, 15, or 30 seconds.");
  if (kind === "audio" && !audioDurations.has(Number(input.duration || 15))) throw new Error("Audio duration must be 5, 8, 10, 12, 15, 20, or 30 seconds.");
}

export async function createGenerationJob(input) {
  const campaign = input.campaignId
    ? await prisma.campaign.findFirst({ where: { id: input.campaignId, organizationId: input.workspaceId } })
    : null;
  if (input.campaignId && !campaign) throw new Error("Campaign not found.");
  const projectId = input.projectId || campaign?.projectId || null;
  const project = projectId
    ? await prisma.project.findFirst({ where: { id: projectId, organizationId: input.workspaceId } })
    : null;
  if (!project) throw new Error("Project not found.");
  if (campaign?.projectId && campaign.projectId !== project.id)
    throw new Error("Campaign does not belong to the selected project.");
  const kind = ["video", "audio"].includes(input.kind) ? input.kind : "image";
  const entitlement = await workspaceEntitlements(prisma, input.workspaceId);
  assertGenerationEntitlement(entitlement, { kind, avatarVideo: Boolean(input.avatarConfig?.enabled) });
  await assertGenerationQuota(prisma, entitlement, { organizationId: input.workspaceId, kind, avatarVideo: Boolean(input.avatarConfig?.enabled) });
  const brandPurpose = input.brandPurpose || (input.avatarConfig?.enabled ? "AVATAR" : kind === "video" ? "VIDEO" : "IMAGE");
  const campaignContent = safeJson(campaign?.contentPlan);
  const campaignBrandSnapshot = campaignContent.brief?.brandKitApplied === false
    ? null
    : campaignContent.brief?.brandKitSnapshot;
  const brandContext = input.applyBrandKit === false
    ? null
    : campaignBrandSnapshot
      ? selectBrandContext({ ...campaignBrandSnapshot, purpose: brandPurpose }, brandPurpose)
      : await buildBrandContext({ organizationId: input.workspaceId, userId: input.userId, purpose: brandPurpose });
  const promptBrandContext = input.callToAction && brandContext
    ? { ...brandContext, callToAction: "" }
    : brandContext;
  const generationPrompt = buildBrandedPrompt(input.prompt, promptBrandContext);
  validateInput(input, kind);
  if (kind === "video" && input.voiceoverConfig?.enabled && String(input.voiceoverConfig.script || "").trim()) {
    const voiceDuration = new OpenAiTtsProvider().estimateDuration(input.voiceoverConfig.script);
    if (voiceDuration > Number(input.duration || 5) + 0.5)
      throw new Error("Voice-over duration must be no longer than the selected video duration. Shorten the script or select a longer video.");
  }
  const primary = providerRouter.selectPrimaryProvider();
  const fallback = providerRouter.selectFallbackProvider(primary.name);
  const scopedApiKey = primary.name === "MUAPI" ? await resolveMuApiKey(prisma, input.workspaceId, input.userId) : null;
  if (!primary.client.isAvailable?.(scopedApiKey) && !fallback) throw new Error("No generation provider is currently configured. Add a MuAPI key in Workspace Settings.");
  const referenceUrl = input.referenceUrl || null;
  const referenceStorage = !referenceUrl && input.referenceFile?.size
    ? await storeLocalFile(input.referenceFile, "references", { workspaceId: input.workspaceId, projectId, resourceId: `reference-${randomUUID()}` })
    : null;
  const now = new Date();
  const asset = await prisma.asset.create({ data: { userId: input.userId, organizationId: input.workspaceId, campaignId: campaign?.id || null, projectId: project.id, title: input.title || `${project.name} ${kind}`, assetType: kind === "video" ? "VIDEO" : kind === "audio" ? "AUDIO" : "IMAGE", status: "QUEUED", prompt: generationPrompt, platforms: JSON.stringify(input.platform ? [input.platform] : []), aspectRatio: kind === "audio" ? null : input.aspectRatio || null, durationSeconds: kind === "video" || kind === "audio" ? Number(input.duration || 5) : null, provider: primary.name, providerStatus: "queued", estimatedCredits: Number(input.estimatedCredits || 0), startedAt: now } });
  const avatarConfig = input.avatarConfig?.enabled ? { ...input.avatarConfig, consentConfirmed: Boolean(input.avatarConfig.consentConfirmed) } : null;
  if (avatarConfig?.enabled && !referenceUrl && !referenceStorage) throw new Error("Choose an avatar image before generating the avatar video.");
  if (avatarConfig?.enabled && !avatarConfig.consentConfirmed) throw new Error("Confirm that you have permission to use this image before generating an avatar video.");
  if (avatarConfig?.enabled && avatarConfig.source === "stock" && !getStockAvatar(avatarConfig.avatarId)) throw new Error("The selected presenter is not available.");
  const requestPayload = { kind, title: input.title, platform: input.platform, aspectRatio: input.aspectRatio, duration: input.duration, referenceUrl, referenceStorage, voiceover: input.voiceover, voiceoverConfig: input.voiceoverConfig || null, avatarConfig, music: input.music, callToAction: input.callToAction || brandContext?.callToAction || null, brandContext, brandKitApplied: Boolean(brandContext), stage: "QUEUED", progressMessage: "Preparing your campaign" };
  const job = await prisma.generationJob.create({ data: { id: `job_${kind}_${randomUUID()}`, organizationId: input.workspaceId, userId: input.userId, projectId: project.id, campaignId: campaign?.id || null, assetId: asset.id, type: kind === "video" ? "VIDEO" : kind === "audio" ? "AUDIO" : "IMAGE", status: "QUEUED", provider: primary.name, prompt: generationPrompt, requestPayload: JSON.stringify(requestPayload), aspectRatio: kind === "audio" ? null : input.aspectRatio || null, durationSeconds: kind === "video" || kind === "audio" ? Number(input.duration || 5) : null, progress: 0, estimatedCredits: Number(input.estimatedCredits || 0), maxRetries: Math.max(0, Number(process.env.PROVIDER_MAX_RETRIES ?? 1)), startedAt: now } });
  if (campaign) await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "GENERATING" } });
  await prisma.project.update({ where: { id: project.id }, data: { status: "IN_PROGRESS" } });
  await enqueueGenerationJob(job.id).catch((error) => console.warn("Redis enqueue failed; submitting the database job directly.", error.message));
  // Submit immediately so a job never depends on an optional worker or on the
  // browser making its first status request. ProviderAttempt's database claim
  // keeps this safe if a BullMQ worker receives the same job concurrently.
  return syncGenerationJob(job);
}

const mergedPayload = (job, additions) => JSON.stringify({ ...safeJson(job.requestPayload), ...additions });

async function submitAttempt(job, providerName, attemptNumber, options = {}) {
  const { client } = providerRouter.getProvider(providerName);
  const scopedApiKey = providerName === "MUAPI" ? await resolveMuApiKey(prisma, job.organizationId, job.userId) : null;
  const effectiveAttemptNumber = Number(safeJson(job.requestPayload).attemptOffset || 0) + attemptNumber;
  const key = attemptKey(job, providerName, effectiveAttemptNumber);
  const attempt = await prisma.providerAttempt.upsert({ where: { idempotencyKey: key }, create: { projectId: job.projectId, campaignId: job.campaignId, generationJobId: job.id, provider: providerName, attemptNumber: effectiveAttemptNumber, idempotencyKey: key, status: options.fallback ? "FALLBACK_STARTED" : "QUEUED" }, update: {} });
  if (attempt.taskId) return prisma.generationJob.update({ where: { id: job.id }, data: { status: "SUBMITTED", provider: providerName, providerJobId: attempt.taskId, providerStatus: "submitted" } });
  const submissionTimeout = Math.max(1000, Number(process.env.PROVIDER_SUBMISSION_TIMEOUT_MS || 30000));
  const claimed = await prisma.providerAttempt.updateMany({
    where: { id: attempt.id, OR: [{ status: { in: ["QUEUED", "FALLBACK_STARTED"] } }, { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - submissionTimeout) } }] },
    data: { status: "RUNNING" },
  });
  if (!claimed.count) return prisma.generationJob.findUnique({ where: { id: job.id } });
  const payload = safeJson(job.requestPayload);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Provider submission timed out.")), submissionTimeout);
    let submitted;
    let attemptPayload = payload;
    let temporaryAudioCleanup = null;
    try {
      if (!payload.avatarConfig?.enabled && !payload.referenceUrl && payload.referenceStorage) {
        if (!client.uploadReferenceFile) throw new Error("The selected generation provider cannot upload reference images.");
        const referenceFile = await loadLocalFile(payload.referenceStorage);
        const uploadedReferenceUrl = await client.uploadReferenceFile(referenceFile, { signal: controller.signal, apiKey: scopedApiKey });
        attemptPayload = { ...payload, referenceUrl: uploadedReferenceUrl };
      }
      if (payload.avatarConfig?.enabled) {
        if (!client.createAvatarTask) throw new Error("The selected generation provider does not support avatar video.");
        const avatarAudio = payload.avatarAudioPath
          ? { audioPath: payload.avatarAudioPath, duration: payload.avatarAudioDuration || null }
          : await new MuApiTtsProvider({ apiKey: scopedApiKey }).synthesize({ text: payload.avatarConfig.script, language: payload.avatarConfig.language, voice: payload.avatarConfig.voice, style: payload.avatarConfig.style });
        temporaryAudioCleanup = avatarAudio.cleanup || null;
        const imageFile = attemptPayload.referenceStorage ? await loadLocalFile(attemptPayload.referenceStorage) : null;
        const audioBytes = await readFile(avatarAudio.audioPath);
        const audioFile = new File([audioBytes], "avatar-voice.mp3", { type: "audio/mpeg" });
        attemptPayload = { ...attemptPayload, avatarAudioPath: avatarAudio.audioPath, avatarAudioDuration: avatarAudio.duration || null };
        submitted = await client.createAvatarTask({ imageFile, imageUrl: attemptPayload.referenceUrl, audioFile, prompt: job.prompt, model: payload.avatarConfig.model, idempotencyKey: key, apiKey: scopedApiKey });
      } else {
        submitted = await client.createVideoTask({ ...attemptPayload, prompt: job.prompt, kind: kindFor(job), duration: job.durationSeconds, aspectRatio: job.aspectRatio, idempotencyKey: key, callbackUrl: process.env.PROVIDER_CALLBACK_BASE_URL ? `${String(process.env.PROVIDER_CALLBACK_BASE_URL).replace(/\/$/, "")}/api/webhooks/${providerName.toLowerCase()}` : undefined, signal: controller.signal, apiKey: scopedApiKey });
      }
    } finally {
      clearTimeout(timer);
      await temporaryAudioCleanup?.().catch(() => {});
    }
    const persistedPayload = { ...safeJson(job.requestPayload) };
    delete persistedPayload.avatarAudioPath;
    await prisma.providerAttempt.update({ where: { id: attempt.id }, data: { taskId: submitted.taskId || null, status: submitted.url ? "SUCCEEDED" : "RUNNING", estimatedCost: Number(submitted.cost?.amount_credits || submitted.cost || 0) || null, completedAt: submitted.url ? new Date() : null } });
    const current = await prisma.generationJob.update({ where: { id: job.id }, data: { status: submitted.url ? "PROCESSING" : "SUBMITTED", provider: providerName, providerModel: submitted.model, providerEndpoint: submitted.model, providerJobId: submitted.taskId || null, providerStatus: submitted.url ? "completed" : "submitted", progress: submitted.url ? 90 : 5, errorMessage: null, requestPayload: JSON.stringify({ ...persistedPayload, avatarAudioDuration: attemptPayload.avatarAudioDuration || payload.avatarAudioDuration || null, nextAttemptAt: null, stage: "GENERATING", progressMessage: providerName === "MUAPI" && options.fallback ? "The first generation service is busy. We are retrying automatically." : payload.avatarConfig?.enabled ? "Creating avatar video" : "Generating scenes" }), fallbackCount: options.fallback ? 1 : job.fallbackCount } });
    return submitted.url ? finalizeSuccess(current, { ...submitted, status: PROVIDER_TASK_STATUS.SUCCEEDED }) : current;
  } catch (error) {
    await prisma.providerAttempt.update({ where: { id: attempt.id }, data: { status: /timeout|abort/i.test(String(error.message)) ? "TIMED_OUT" : "FAILED", failureReason: String(error.message || error), completedAt: new Date() } });
    return handleAttemptFailure(job, providerName, error);
  }
}

async function handleAttemptFailure(job, providerName, error) {
  if (fallbackEligible(error) && !skipPrimaryRetry(error) && job.retryCount < job.maxRetries) {
    const retryAt = new Date(Date.now() + Math.max(1000, Number(process.env.PROVIDER_RETRY_DELAY_MS || 3000))).toISOString();
    return prisma.generationJob.update({ where: { id: job.id }, data: { status: "QUEUED", providerJobId: null, providerStatus: "retry_wait", retryCount: { increment: 1 }, errorMessage: String(error.message || error), requestPayload: mergedPayload(job, { nextAttemptAt: retryAt, stage: "GENERATING", progressMessage: "The first generation service is busy. We are retrying automatically." }) } });
  }
  if (fallbackEligible(error) && (job.fallbackCount || 0) < 1) {
    const fallback = providerRouter.selectFallbackProvider(providerName);
    if (fallback) return submitAttempt(job, fallback.name, job.maxRetries + 2, { fallback: true });
  }
  return failJob(job, error);
}

async function finalizeSuccess(job, result) {
  try {
  const finalizationTimeout = Math.max(60000, Number(process.env.FINALIZATION_TIMEOUT_MS || 10 * 60 * 1000));
  const claimed = await prisma.generationJob.updateMany({
    where: { id: job.id, status: { in: ["SUBMITTED", "PROCESSING"] }, OR: [{ providerStatus: { not: "finalizing" } }, { providerStatus: null }, { updatedAt: { lt: new Date(Date.now() - finalizationTimeout) } }] },
    data: { status: "PROCESSING", providerStatus: "finalizing", progress: 90 },
  });
  if (!claimed.count) return prisma.generationJob.findUnique({ where: { id: job.id } });
  const attempt = await prisma.providerAttempt.findFirst({ where: { generationJobId: job.id, provider: job.provider, taskId: job.providerJobId }, orderBy: { attemptNumber: "desc" } });
  if (!result.url && job.providerJobId) {
    const scopedApiKey = job.provider === "MUAPI" ? await resolveMuApiKey(prisma, job.organizationId, job.userId) : null;
    result = await providerRouter.getProvider(job.provider).client.downloadResult(job.providerJobId, kindFor(job), scopedApiKey);
  }
  if (!result.url) return failJob(job, new Error("Provider completed without a media URL."));
  const downloaded = await downloadRemoteToTempFile(result.url);
  let rendered = null;
  let voiceoverCleanup = null;
  let logoCleanup = null;
  let output;
  try {
    if (kindFor(job) === "video") {
      await prisma.generationJob.update({ where: { id: job.id }, data: { progress: 92, requestPayload: mergedPayload(job, { stage: "RENDERING", progressMessage: "Rendering final video" }) } });
      const payload = safeJson(job.requestPayload);
      let voiceoverPath = null;
      const voiceoverConfig = payload.voiceoverConfig || null;
      if (!payload.avatarConfig?.enabled && voiceoverConfig?.enabled && String(voiceoverConfig.script || '').trim()) {
        const provider = new OpenAiTtsProvider();
        const voiceResult = await provider.synthesize({ text: voiceoverConfig.script, language: voiceoverConfig.language || 'en-IN', voice: voiceoverConfig.voice, style: voiceoverConfig.style || 'Natural' });
        if (Number(voiceResult.duration || 0) > Number(job.durationSeconds || payload.duration || 5) + 0.5) throw new Error('Voice-over duration must be no longer than the selected video duration. Shorten the script or select a longer video.');
        voiceoverPath = voiceResult.audioPath;
        voiceoverCleanup = voiceResult.cleanup || null;
      }
      const logoFile = payload.brandContext?.applyLogoToVideos ? await resolveBrandLogoPath(payload.brandContext, job.organizationId) : null;
      const logoPath = logoFile?.path || null;
      logoCleanup = logoFile?.cleanup || null;
      rendered = await ffmpegRenderer.render({ inputPath: downloaded.localPath, aspectRatio: job.aspectRatio || "9:16", duration: job.durationSeconds, callToAction: payload.callToAction, brandColor: payload.brandContext?.brandColors?.[0], logoPath, logoPlacement: payload.brandContext?.logoPlacement, voiceoverPath });
      const videoUrl = await uploadLocalFile(rendered.outputPath, { workspaceId: job.organizationId, projectId: job.projectId, resourceId: job.assetId, category: "videos", contentType: "video/mp4" });
      const thumbnailUrl = await uploadLocalFile(rendered.thumbnailPath, { workspaceId: job.organizationId, projectId: job.projectId, resourceId: `${job.assetId}-thumbnail`, category: "images", contentType: "image/jpeg" });
      output = { url: videoUrl, thumbnailUrl };
    } else {
      const mediaCategory = kindFor(job) === "audio" ? "audio" : "images";
      const mediaType = downloaded.mimeType || (mediaCategory === "audio" ? "audio/mpeg" : "image/jpeg");
      const storedReference = await uploadLocalFile(downloaded.localPath, { workspaceId: job.organizationId, projectId: job.projectId, resourceId: job.assetId, category: mediaCategory, contentType: mediaType });
      output = { url: storedReference, thumbnailUrl: mediaCategory === "images" ? storedReference : null };
    }
  } finally {
    await Promise.allSettled([downloaded.cleanup, rendered?.cleanup, voiceoverCleanup, logoCleanup].filter((cleanup) => typeof cleanup === "function").map((cleanup) => cleanup()));
  }
  const now = new Date();
  const charged = Number(result.cost?.amount_credits || result.cost || 0) || 0;
  await prisma.asset.update({ where: { id: job.assetId }, data: { status: "COMPLETED", provider: job.provider, providerJobId: job.providerJobId, providerStatus: "completed", outputUrl: output.url, thumbnailUrl: output.thumbnailUrl, chargedCredits: charged, completedAt: now } });
  if (attempt) await prisma.providerAttempt.update({ where: { id: attempt.id }, data: { status: "SUCCEEDED", actualCost: charged || null, completedAt: now } });
  const kind = kindFor(job);
  const completed = await prisma.generationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", providerStatus: "completed", progress: 100, errorMessage: null, responsePayload: JSON.stringify({ url: output.url, thumbnailUrl: output.thumbnailUrl, providerSourceUrl: result.url }), chargedCredits: charged, requestPayload: mergedPayload(job, { stage: "COMPLETED", progressMessage: `Your ${kind} is ready` }), completedAt: now } });
  if (job.projectId && kindFor(job) === "video") await prisma.project.update({ where: { id: job.projectId }, data: { finalVideoUrl: output.url, finalThumbnailUrl: output.thumbnailUrl, successfulProvider: job.provider, successfulProviderTaskId: job.providerJobId, status: "COMPLETED" } });
  await reconcileCampaign(job.campaignId);
  return completed;
  } catch (error) {
    return failJob(job, new Error(`Final media processing failed: ${error.message || error}`));
  }
}

async function failJob(job, error) {
  const message = String(error?.message || error || "Generation failed.");
  if (job.assetId) await prisma.asset.update({ where: { id: job.assetId }, data: { status: "FAILED", providerStatus: "failed", errorMessage: message, completedAt: new Date() } });
  const failed = await prisma.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", providerStatus: "failed", progress: 100, errorMessage: message, completedAt: new Date() } });
  if (job.projectId) await prisma.project.update({ where: { id: job.projectId }, data: { status: "FAILED" } });
  await reconcileCampaign(job.campaignId);
  return failed;
}

export async function syncGenerationJob(job) {
  if (!job || terminalStatuses.has(job.status)) return job;
  if (job.status === "QUEUED" || !job.providerJobId) {
    const payload = safeJson(job.requestPayload);
    if (payload.nextAttemptAt && Date.now() < new Date(payload.nextAttemptAt).getTime()) return job;
    const primary = providerRouter.selectPrimaryProvider();
    const scopedApiKey = primary.name === "MUAPI" ? await resolveMuApiKey(prisma, job.organizationId, job.userId) : null;
    if (!primary.client.isAvailable?.(scopedApiKey)) {
      const fallback = providerRouter.selectFallbackProvider(primary.name);
      if (fallback) return submitAttempt(job, fallback.name, job.maxRetries + 2, { fallback: true });
    }
    return submitAttempt(job, primary.name, job.retryCount + 1);
  }
  let attempt = null;
  try {
    attempt = await prisma.providerAttempt.findFirst({ where: { generationJobId: job.id, taskId: job.providerJobId }, orderBy: { attemptNumber: "desc" } });
    const taskTimeout = Math.max(1000, Number(process.env.PROVIDER_TASK_TIMEOUT_MS || (kindFor(job) === "video" ? 15 * 60 * 1000 : 10 * 60 * 1000)));
    const timedOut = attempt && Date.now() - new Date(attempt.startedAt).getTime() > taskTimeout;
    const scopedApiKey = job.provider === "MUAPI" ? await resolveMuApiKey(prisma, job.organizationId, job.userId) : null;
    const result = await providerRouter.getProvider(job.provider).client.getTaskStatus(job.providerJobId, kindFor(job), scopedApiKey);
    if (result.status === PROVIDER_TASK_STATUS.SUCCEEDED) return finalizeSuccess(job, result);
    if (result.status === PROVIDER_TASK_STATUS.FAILED || timedOut) {
      const error = new Error(timedOut ? "Provider task timed out." : result.error || "Provider generation failed.");
      if (attempt) await prisma.providerAttempt.update({ where: { id: attempt.id }, data: { status: timedOut ? "TIMED_OUT" : "FAILED", failureReason: error.message, completedAt: new Date() } });
      return handleAttemptFailure(job, job.provider, error);
    }
    return prisma.generationJob.update({ where: { id: job.id }, data: { status: "PROCESSING", providerStatus: String(result.status).toLowerCase(), progress: percent(result.progress, job.progress) } });
  } catch (error) {
    const taskTimeout = Math.max(1000, Number(process.env.PROVIDER_TASK_TIMEOUT_MS || (kindFor(job) === "video" ? 15 * 60 * 1000 : 10 * 60 * 1000)));
    const timedOut = attempt && Date.now() - new Date(attempt.startedAt).getTime() > taskTimeout;
    if (/invalid request body|failed nullable validation|\b4\d\d\b/i.test(String(error.message || error))) {
      if (attempt) await prisma.providerAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", failureReason: String(error.message || error), completedAt: new Date() } });
      return failJob(job, new Error(`Provider validation failed: ${error.message || error}`));
    }
    if (timedOut && fallbackEligible(error)) {
      await prisma.providerAttempt.update({ where: { id: attempt.id }, data: { status: "TIMED_OUT", failureReason: String(error.message || error), completedAt: new Date() } });
      return handleAttemptFailure(job, job.provider, new Error("Provider task timed out."));
    }
    return prisma.generationJob.update({ where: { id: job.id }, data: { errorMessage: error.message || "Unable to refresh provider status." } });
  }
}

export async function processPendingGenerationJobs(limit = 10) {
  const jobs = await prisma.generationJob.findMany({ where: { status: { in: ["QUEUED", "SUBMITTED", "PROCESSING"] } }, orderBy: { createdAt: "asc" }, take: limit });
  const results = [];
  for (const job of jobs) results.push(await syncGenerationJob(job));
  return results;
}

async function reconcileCampaign(campaignId) {
  if (!campaignId) return;
  const jobs = await prisma.generationJob.findMany({ where: { campaignId }, select: { status: true } });
  if (!jobs.length || jobs.some((item) => !terminalStatuses.has(item.status))) return;
  const completed = jobs.every((item) => item.status === "COMPLETED");
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { contentPlan: true } });
  const content = safeJson(campaign?.contentPlan);
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: completed ? "COMPLETED" : "FAILED", contentPlan: JSON.stringify({ ...content, localStatus: completed ? "assets_completed" : "assets_failed" }) } });
}

export async function retryGenerationJob(job) {
  if (!["FAILED", "CANCELLED"].includes(job.status)) throw new Error("Only failed generation jobs can be retried.");
  const primary = providerRouter.selectPrimaryProvider();
  const attempts = await prisma.providerAttempt.aggregate({ where: { generationJobId: job.id }, _max: { attemptNumber: true } });
  const attemptOffset = attempts._max.attemptNumber || 0;
  const reset = await prisma.generationJob.update({ where: { id: job.id }, data: { status: "QUEUED", provider: primary.name, providerJobId: null, providerStatus: "queued", progress: 0, errorMessage: null, retryCount: 0, fallbackCount: 0, requestPayload: mergedPayload(job, { attemptOffset, stage: "QUEUED", progressMessage: "Preparing your campaign" }), startedAt: new Date(), completedAt: null } });
  await prisma.asset.update({ where: { id: job.assetId }, data: { status: "QUEUED", provider: primary.name, providerJobId: null, providerStatus: "queued", outputUrl: null, errorMessage: null, completedAt: null } });
  await enqueueGenerationJob(job.id).catch((error) => console.warn("Redis enqueue failed; the recovery worker will pick up the database job.", error.message));
  return reset;
}
