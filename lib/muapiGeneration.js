const MUAPI_BASE = "https://api.muapi.ai";

export const VIDEO_DURATIONS = new Set([5, 10, 15, 30]);
export const AUDIO_DURATIONS = new Set([5, 8, 10, 12, 15, 20, 30]);

const defaults = {
  image: { model: "nano-banana", aspectRatio: "1:1" },
  video: {
    model: "minimax-h3-open-text-to-video",
    aspectRatio: "9:16",
    duration: 5,
  },
  audio: { model: "mmaudio-v2/text-to-audio", duration: 15 },
};

function outputUrl(result, kind = "image") {
  const candidates = [];
  const visit = (value, path = "") => {
    if (typeof value === "string" && /^https?:\/\//i.test(value))
      candidates.push({ url: value, path: path.toLowerCase() });
    else if (Array.isArray(value))
      value.forEach((item, index) => visit(item, `${path}.${index}`));
    else if (value && typeof value === "object")
      Object.entries(value).forEach(([key, item]) =>
        visit(item, `${path}.${key}`),
      );
  };
  visit(result);
  const video = /\.(mp4|webm|mov|m3u8)(?:\?|$)/i;
  const image = /\.(png|jpe?g|webp|avif)(?:\?|$)/i;
  const audio = /\.(mp3|wav|m4a|ogg|aac|flac)(?:\?|$)/i;
  const score = ({ url, path }) =>
    kind === "audio"
      ? (audio.test(url) ? 240 : 0) +
        (path.includes("audio") ? 90 : 0) -
        (video.test(url) || image.test(url) ? 200 : 0)
      : kind === "video"
        ? (video.test(url) ? 200 : 0) +
          (path.includes("video") ? 80 : 0) -
          (image.test(url) ? 200 : 0) -
          (/thumbnail|preview|poster|first_frame/.test(path) ? 100 : 0)
        : (image.test(url) ? 200 : 0) +
          (path.includes("image") ? 50 : 0) -
          (video.test(url) ? 200 : 0);
  return (
    candidates.sort((left, right) => score(right) - score(left))[0]?.url || null
  );
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text };
  }
}

function providerErrorMessage(data) {
  const candidate = data?.detail ?? data?.error ?? data?.message;
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof candidate === "object") {
    const nested = candidate.message ?? candidate.detail ?? candidate.error ?? candidate.reason;
    if (typeof nested === "string") return nested;
    try { return JSON.stringify(candidate); } catch {}
  }
  return "";
}

async function uploadReference(file, apiKey) {
  if (!file || typeof file !== "object" || file.size === 0) return null;
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Reference images must be 10MB or smaller.");
  if (
    file.type &&
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("Reference images must be JPG, PNG, or WebP.");
  const formData = new FormData();
  formData.append("file", file, file.name || "reference-image");
  const response = await fetch(`${MUAPI_BASE}/api/v1/upload_file`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: formData,
  });
  const data = await readJson(response);
  if (!response.ok)
    throw new Error(
      data.detail ||
        data.error ||
        `Reference upload failed (${response.status})`,
    );
  const url = data.url || data.file_url || data.data?.url;
  if (!url || !/^https?:\/\//i.test(url))
    throw new Error("Reference upload did not return a usable image URL.");
  return url;
}

export async function uploadMuapiFile(file, scopedApiKey) {
  const apiKey = scopedApiKey || process.env.MUAPI_API_KEY;
  if (!apiKey) throw new Error("MUAPI_API_KEY is not configured on the server.");
  if (!file || typeof file !== "object" || file.size === 0) return null;
  if (file.size > 25 * 1024 * 1024) throw new Error("Uploaded media must be 25MB or smaller.");
  const formData = new FormData();
  formData.append("file", file, file.name || "media-file");
  const response = await fetch(`${MUAPI_BASE}/api/v1/upload_file`, { method: "POST", headers: { "x-api-key": apiKey }, body: formData });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.detail || data.error || `Media upload failed (${response.status}).`);
  const url = data.url || data.file_url || data.data?.url;
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("Media upload did not return a usable URL.");
  return url;
}

export async function uploadMuapiReference(file, scopedApiKey) {
  const apiKey = scopedApiKey || process.env.MUAPI_API_KEY;
  if (!apiKey) throw new Error("MUAPI_API_KEY is not configured on the server.");
  return uploadReference(file, apiKey);
}

export async function submitMuapiGeneration(input) {
  const apiKey = input.apiKey || process.env.MUAPI_API_KEY;
  if (!apiKey)
    throw new Error("MUAPI_API_KEY is not configured on the server.");
  const kind = ["video", "audio"].includes(input.kind) ? input.kind : "image";
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw new Error("A prompt is required.");
  const referenceUrl =
    kind === "audio"
      ? null
      : input.referenceUrl ||
        (await uploadReference(input.referenceFile, apiKey));
  const payload =
    kind === "audio"
      ? { prompt }
      : {
          prompt,
          aspect_ratio: String(input.aspectRatio || defaults[kind].aspectRatio),
        };
  let model = String(input.model || defaults[kind].model);
  let duration = null;

  if (kind === "audio") {
    duration = Number(input.duration || defaults.audio.duration);
    if (!AUDIO_DURATIONS.has(duration))
      throw new Error(
        "Audio duration must be 5, 8, 10, 12, 15, 20, or 30 seconds.",
      );
    model = process.env.MUAPI_AUDIO_MODEL || defaults.audio.model;
    payload.duration = duration;
  } else if (kind === "video") {
    duration = Number(input.duration || defaults.video.duration);
    if (!VIDEO_DURATIONS.has(duration))
      throw new Error("Video duration must be 5, 10, 15, or 30 seconds.");
    const extended = duration === 30;
    model = extended
      ? referenceUrl
        ? process.env.MUAPI_VIDEO_30S_IMAGE_MODEL ||
          "seedance-2.5-intl-omni-reference-480p"
        : process.env.MUAPI_VIDEO_30S_TEXT_MODEL ||
          "seedance-2.5-intl-text-to-video-480p"
      : referenceUrl
        ? process.env.MUAPI_VIDEO_AUDIO_IMAGE_MODEL ||
          "minimax-h3-open-image-to-video"
        : process.env.MUAPI_VIDEO_AUDIO_TEXT_MODEL ||
          "minimax-h3-open-text-to-video";
    payload.duration = duration;
    if (!extended) payload.resolution = process.env.MUAPI_VIDEO_RESOLUTION || "480p";
    if (referenceUrl && extended) {
      payload.images_list = [referenceUrl];
      payload.omni_reference_task_type = "reference";
      payload.high_bitrate = false;
      payload.prompt = `Use the supplied product image as the primary visual reference. Preserve its subject, colors, identity and important details throughout the video. Motion direction: ${prompt}`;
    } else if (referenceUrl) {
      delete payload.aspect_ratio;
      payload.image_url = referenceUrl;
      payload.prompt = `Animate the supplied reference image as the first frame. Preserve the exact product, person, colors, text and composition. Do not replace the subject. Motion direction: ${prompt}`;
    } else if (extended) {
      payload.high_bitrate = false;
    }
  } else if (referenceUrl) payload.image_url = referenceUrl;

  const response = await fetch(`${MUAPI_BASE}/api/v1/${model}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response);
  if (!response.ok) {
    const providerMessage = providerErrorMessage(data);
    if (/exp.*claim.*timestamp/i.test(providerMessage))
      throw new Error(
        "The media provider rejected its expired service credential. Update MUAPI_API_KEY and restart the server.",
      );
    throw new Error(
      providerMessage || `MuAPI rejected the request (${response.status})`,
    );
  }
  const requestId = data.request_id || data.id || data.task_id || null;
  const url = requestId ? null : outputUrl(data, kind);
  if (!requestId && !url)
    throw new Error(
      "MuAPI accepted the request without returning a request ID or media URL.",
    );
  return {
    kind,
    model,
    duration,
    referenceUrl,
    requestId,
    url,
    status: requestId ? "submitted" : "completed",
    cost: data.cost || null,
    raw: data,
  };
}

export async function pollMuapiGeneration(requestId, kind, scopedApiKey) {
  const apiKey = scopedApiKey || process.env.MUAPI_API_KEY;
  if (!apiKey)
    throw new Error("MUAPI_API_KEY is not configured on the server.");
  const response = await fetch(
    `${MUAPI_BASE}/api/v1/predictions/${requestId}/result`,
    { headers: { "x-api-key": apiKey }, cache: "no-store" },
  );
  const data = await readJson(response);
  if (!response.ok)
    throw new Error(
      providerErrorMessage(data) ||
        `Generation status failed (${response.status})`,
    );
  const status = String(data.status || "").toLowerCase();
  if (["failed", "error", "cancelled", "canceled"].includes(status))
    return {
      status: "failed",
      error: providerErrorMessage(data) || "MuAPI generation failed",
      raw: data,
    };
  if (!["completed", "succeeded", "success"].includes(status))
    return {
      status: "processing",
      progress: data.progress == null ? null : Number(data.progress),
      raw: data,
    };
  const url = outputUrl(data, kind);
  if (!url)
    throw new Error(
      "MuAPI completed without returning the requested media URL.",
    );
  if (kind === "video" && /\.(?:avif|png|jpe?g|webp)(?:\?|$)/i.test(url)) {
    const zeroCost = Number(data?.cost?.amount_credits || 0) === 0 && Number(data?.cost?.amount_usd || 0) === 0;
    throw new Error(zeroCost
      ? "MuAPI returned a sandbox mock image instead of a video. Configure a production MUAPI_API_KEY to generate real videos."
      : "MuAPI returned an image instead of the requested video.");
  }
  return {
    status: "completed",
    progress: 100,
    url,
    cost: data.cost || null,
    raw: data,
  };
}
