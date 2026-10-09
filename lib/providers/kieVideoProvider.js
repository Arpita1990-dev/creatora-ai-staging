import { ProviderError } from "./providerError.js";
import { PROVIDER_TASK_STATUS } from "./videoProvider.js";

const DEFAULT_BASE_URL = "https://api.kie.ai";
const DEFAULT_UPLOAD_BASE_URL = "https://kieai.redpandaai.co";

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function findUrl(value) {
  const candidates = [];
  const visit = (item) => {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) candidates.push(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") Object.values(item).forEach(visit);
  };
  visit(value);
  return candidates.find((url) => /\.(mp4|mov|webm|mp3|wav|png|jpe?g|webp)(?:\?|$)/i.test(url)) || candidates[0] || null;
}

async function responseJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { msg: text }; }
}

function requestError(data, response, provider = "kie") {
  const message = data?.msg || data?.message || data?.error || `Provider request failed (${response.status})`;
  return new ProviderError(String(message), {
    provider,
    httpStatus: response.status,
    code: data?.code,
    retryable: response.status === 408 || response.status === 429 || response.status >= 500,
  });
}

export class KieVideoProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? process.env.KIE_API_KEY;
    this.baseUrl = options.baseUrl ?? process.env.KIE_API_BASE_URL ?? DEFAULT_BASE_URL;
    this.uploadBaseUrl = options.uploadBaseUrl ?? process.env.KIE_UPLOAD_BASE_URL ?? DEFAULT_UPLOAD_BASE_URL;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  isAvailable() { return Boolean(this.apiKey); }

  modelFor(kind, hasReference = false) {
    if (kind === "audio") return process.env.KIE_MUSIC_MODEL || process.env.KIE_VOICE_MODEL;
    if (kind === "image") {
      const configured = process.env.KIE_IMAGE_MODEL;
      if (!hasReference) return configured || "qwen3/text-to-image";
      if (process.env.KIE_IMAGE_REFERENCE_MODEL) return process.env.KIE_IMAGE_REFERENCE_MODEL;
      if (configured && /image-to-image|image-edit/i.test(configured)) return configured;
      if (configured && /text-to-image/i.test(configured)) return configured.replace(/text-to-image/i, "image-to-image");
      return "qwen3/image-to-image";
    }
    return process.env.KIE_VIDEO_MODEL || "wan/3-0-video";
  }

  async uploadReferenceFile(file, options = {}) {
    if (!this.apiKey) throw new ProviderError("KIE_API_KEY is not configured on the server.", { provider: "kie", retryable: true });
    const body = new FormData();
    body.append("file", file, file.name || "reference-image");
    body.append("uploadPath", "creatora/references");
    body.append("fileName", `${crypto.randomUUID()}-${file.name || "reference-image"}`);
    const response = await this.fetch(`${this.uploadBaseUrl}/api/file-stream-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body,
      signal: options.signal,
    });
    const data = await responseJson(response);
    if (!response.ok || data.success === false) throw requestError(data, response);
    const url = data?.data?.downloadUrl || data?.data?.fileUrl;
    if (!url) throw new ProviderError("Kie.ai file upload did not return a public URL.", { provider: "kie", retryable: true });
    return url;
  }

  async createVideoTask(input) {
    if (!this.apiKey) throw new ProviderError("KIE_API_KEY is not configured on the server.", { provider: "kie", retryable: true });
    const kind = input.kind || "video";
    const model = input.model || this.modelFor(kind, Boolean(input.referenceUrl));
    if (!model) throw new ProviderError(`No Kie.ai model is configured for ${kind}.`, { provider: "kie", code: "MODEL_NOT_CONFIGURED", retryable: true });
    const referenceInstruction = input.referenceUrl
      ? kind === "video"
        ? " Use Image1 as the source of truth. Preserve the exact product identity, shape, colors, materials, logo, and proportions; animate the referenced product instead of inventing a different one."
        : " Use the attached image as the source of truth. Preserve the exact subject or product identity, shape, colors, materials, logo, and proportions. Only make the changes explicitly requested."
      : "";
    const providerInput = { prompt: `${input.prompt}${referenceInstruction}`.trim() };
    if (kind === "video" && /^wan\/3-0-video(?:-prime)?$/i.test(model)) {
      providerInput.resolution = input.resolution || "480P";
    }
    if (kind !== "audio" && !/^qwen3\//i.test(model)) providerInput.aspect_ratio = input.aspectRatio || "9:16";
    if (input.duration) providerInput.duration = Number(input.duration);
    if (kind === "image" && /^qwen3\//i.test(model)) {
      providerInput.resolution = "1K";
      providerInput.image_size = input.aspectRatio || "1:1";
      providerInput.output_format = "png";
      providerInput.prompt_extend = !input.referenceUrl;
      providerInput.nsfw_checker = false;
      providerInput.negative_prompt = "different product, changed logo, altered identity, wrong colors, distorted, blurry, low quality";
    }
    if (input.referenceUrl) {
      if (/^wan\/3-0-video(?:-prime)?$/i.test(model))
        providerInput.reference_image_urls = [input.referenceUrl];
      else if (/^qwen\/(?:image-to-image|image-edit)$/i.test(model))
        providerInput.image_url = input.referenceUrl;
      else if (/^gpt-image/i.test(model) || /^gpt-image\//i.test(model) || /^flux-2\//i.test(model))
        providerInput.input_urls = [input.referenceUrl];
      else
        providerInput.image_urls = [input.referenceUrl];
    }
    if (kind === "video" && input.voiceover !== false) {
      providerInput.audio = true;
      if (input.voiceover === true) {
        providerInput.prompt += " Include clear natural voiceover narration that explains the message and stays synchronized with the visuals.";
      }
    }
    const payload = { model, input: providerInput };
    if (input.callbackUrl) payload.callBackUrl = input.callbackUrl;
    const response = await this.fetch(`${this.baseUrl}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify(payload),
      signal: input.signal,
    });
    const data = await responseJson(response);
    if (!response.ok || (data.code != null && Number(data.code) !== 200)) throw requestError(data, response);
    const taskId = data?.data?.taskId || data?.taskId;
    if (!taskId) throw new ProviderError("Kie.ai accepted the request without returning a task ID.", { provider: "kie", retryable: true });
    return { taskId, provider: "KIE", model, status: PROVIDER_TASK_STATUS.QUEUED, raw: data };
  }

  async getTaskStatus(taskId) {
    if (!this.apiKey) throw new ProviderError("KIE_API_KEY is not configured on the server.", { provider: "kie", retryable: true });
    const response = await this.fetch(`${this.baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }, cache: "no-store",
    });
    const body = await responseJson(response);
    if (!response.ok || (body.code != null && ![200, 505].includes(Number(body.code)))) throw requestError(body, response);
    const data = body.data || body;
    const state = String(data.state || "").toLowerCase();
    const result = parseJson(data.resultJson || data.result || data.response, data.result || data.response || {});
    if (["success", "succeeded", "completed"].includes(state)) return { status: PROVIDER_TASK_STATUS.SUCCEEDED, progress: 100, url: findUrl(result), cost: data.creditsConsumed ?? null, raw: body };
    if (["fail", "failed", "error", "cancelled", "canceled"].includes(state)) return { status: PROVIDER_TASK_STATUS.FAILED, error: data.failMsg || data.errorMessage || "Kie.ai generation failed.", code: data.failCode || null, raw: body };
    return { status: state === "waiting" || state === "queuing" ? PROVIDER_TASK_STATUS.QUEUED : PROVIDER_TASK_STATUS.RUNNING, progress: data.progress == null ? null : Number(data.progress), raw: body };
  }

  async downloadResult(taskId, kind) {
    const result = await this.getTaskStatus(taskId, kind);
    if (result.status !== PROVIDER_TASK_STATUS.SUCCEEDED || !result.url) throw new ProviderError("Kie.ai result is not ready for download.", { provider: "kie", retryable: true });
    return { url: result.url, cost: result.cost, raw: result.raw };
  }
}
