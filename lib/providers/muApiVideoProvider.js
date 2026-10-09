import { pollMuapiGeneration, submitMuapiGeneration, uploadMuapiReference } from "../muapiGeneration.js";
import { ProviderError } from "./providerError.js";
import { PROVIDER_TASK_STATUS } from "./videoProvider.js";
import { muApiAvatarProvider } from "./muApiAvatarProvider.js";

export class MuApiVideoProvider {
  isAvailable(scopedApiKey) { return Boolean(scopedApiKey || process.env.MUAPI_API_KEY); }

  async uploadReferenceFile(file, options = {}) { return uploadMuapiReference(file, options.apiKey); }

  async createAvatarTask(input) { return muApiAvatarProvider.createAvatarTask(input); }

  async createVideoTask(input) {
    try {
      let normalizedInput = input;
      if (input.referenceUrl && !/^https:\/\/[^/]*muapi\.ai\//i.test(input.referenceUrl)) {
        const response = await fetch(input.referenceUrl, { redirect: "follow", signal: input.signal });
        if (!response.ok) throw new Error(`Unable to retrieve the reference image (${response.status}).`);
        const declaredSize = Number(response.headers.get("content-length") || 0);
        if (declaredSize > 10 * 1024 * 1024) throw new Error("Reference images must be 10MB or smaller.");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Reference images must be 10MB or smaller.");
        const contentType = String(response.headers.get("content-type") || "image/jpeg").split(";")[0];
        if (!["image/jpeg", "image/png", "image/webp"].includes(contentType))
          throw new Error("Reference images must be JPG, PNG, or WebP.");
        const extension = contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : ".jpg";
        const referenceFile = new File([bytes], `reference${extension}`, { type: contentType });
        normalizedInput = { ...input, referenceUrl: await uploadMuapiReference(referenceFile, input.apiKey) };
      }
      const result = await submitMuapiGeneration(normalizedInput);
      return { taskId: result.requestId, provider: "MUAPI", model: result.model, status: result.url ? PROVIDER_TASK_STATUS.SUCCEEDED : PROVIDER_TASK_STATUS.QUEUED, url: result.url, cost: result.cost, referenceUrl: result.referenceUrl, raw: result.raw };
    } catch (error) {
      throw new ProviderError(error.message || "MuAPI submission failed.", { provider: "muapi", retryable: /timeout|429|rate|temporar|unavailable|5\d\d/i.test(String(error.message)) });
    }
  }

  async getTaskStatus(taskId, kind = "video", scopedApiKey) {
    const result = await pollMuapiGeneration(taskId, kind, scopedApiKey);
    if (result.status === "completed") return { ...result, status: PROVIDER_TASK_STATUS.SUCCEEDED };
    if (result.status === "failed") return { ...result, status: PROVIDER_TASK_STATUS.FAILED };
    return { ...result, status: PROVIDER_TASK_STATUS.RUNNING };
  }

  async downloadResult(taskId, kind, scopedApiKey) {
    const result = await this.getTaskStatus(taskId, kind, scopedApiKey);
    if (result.status !== PROVIDER_TASK_STATUS.SUCCEEDED || !result.url) throw new ProviderError("MuAPI result is not ready for download.", { provider: "muapi", retryable: true });
    return result;
  }
}
