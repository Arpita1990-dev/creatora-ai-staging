import { ProviderError } from "./providerError.js";
import { uploadMuapiFile } from "../muapiGeneration.js";
import { PROVIDER_TASK_STATUS } from "./videoProvider.js";

export class MuApiAvatarProvider {
  isAvailable(scopedApiKey) { return Boolean(scopedApiKey || process.env.MUAPI_API_KEY); }

  async createAvatarTask(input) {
    try {
      const imageUrl = input.imageFile ? await uploadMuapiFile(input.imageFile, input.apiKey) : input.imageUrl;
      const audioUrl = input.audioFile ? await uploadMuapiFile(input.audioFile, input.apiKey) : input.audioUrl;
      if (!imageUrl || !audioUrl) throw new Error("Avatar image and generated audio are required.");
      const model = input.model || process.env.MUAPI_AVATAR_MODEL || "wan2.2-speech-to-video";
      const response = await fetch(`https://api.muapi.ai/api/v1/${model}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": input.apiKey || process.env.MUAPI_API_KEY, ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) },
        body: JSON.stringify({
          prompt: input.prompt || "Create a natural talking presenter video synchronized to the supplied audio.",
          image_url: imageUrl,
          audio_url: audioUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || data.message || `MuAPI avatar generation failed (${response.status}).`);
      const taskId = data.request_id || data.id || data.task_id;
      if (!taskId) throw new Error("MuAPI avatar generation did not return a request ID.");
      return { taskId, model, status: PROVIDER_TASK_STATUS.QUEUED, raw: data };
    } catch (error) {
      throw new ProviderError(error.message || "MuAPI avatar submission failed.", { provider: "muapi", retryable: /timeout|429|rate|temporar|unavailable|5\d\d/i.test(String(error.message)) });
    }
  }
}

export const muApiAvatarProvider = new MuApiAvatarProvider();