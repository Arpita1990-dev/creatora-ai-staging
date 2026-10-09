import { readFile } from "node:fs/promises";
import { downloadRemoteToTempFile } from "../storage.js";
import { getLanguageConfig, normalizeLanguageCode, prepareScriptText } from "./languages.js";

const MUAPI_BASE = "https://api.muapi.ai";

const providerMessage = (data) => {
  const value = data?.detail || data?.error || data?.message;
  return typeof value === "string" ? value : "";
};

function providerErrorText(data) {
  const direct = providerMessage(data);
  if (direct) return direct;
  const detail = data?.detail || data?.error;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || item?.message || String(item)).join("; ");
  if (detail && typeof detail === "object") return detail.message || detail.msg || JSON.stringify(detail);
  return "";
}

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { detail: text }; }
}

export class MuApiTtsProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.fetch = options.fetch || globalThis.fetch;
    this.model = options.model || process.env.MUAPI_TTS_MODEL || "minimax-speech-2.6-hd";
  }

  isAvailable() { return Boolean(this.apiKey || process.env.MUAPI_API_KEY); }

  async synthesize({ text, language = "en-IN", voice, style = "Natural" }) {
    const apiKey = this.apiKey || process.env.MUAPI_API_KEY;
    const cleanText = prepareScriptText(text);
    if (!cleanText) throw new Error("A script is required before generating voice audio.");
    const languageCode = normalizeLanguageCode(language);
    if (!["en-IN", "hi-IN"].includes(languageCode)) throw new Error("Unsupported language. Please choose English or Hindi.");
    const config = getLanguageConfig(languageCode);
    const voiceId = voice || config.muapiVoice || "Friendly_Person";
    const response = await this.fetch(`${MUAPI_BASE}/api/v1/${this.model}`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: cleanText, voice_id: voiceId, speed: 1, format: "mp3" }),
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(providerErrorText(data) || `MuAPI speech generation failed (${response.status}).`);
    const requestId = data.request_id || data.id || data.task_id;
    if (!requestId) throw new Error("MuAPI speech generation did not return a request ID.");
    let result;
    const deadline = Date.now() + Number(process.env.MUAPI_TTS_TIMEOUT_MS || 10 * 60 * 1000);
    do {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const statusResponse = await this.fetch(`${MUAPI_BASE}/api/v1/predictions/${requestId}/result`, { headers: { "x-api-key": apiKey }, cache: "no-store" });
      const statusData = await readJson(statusResponse);
      if (!statusResponse.ok) throw new Error(providerErrorText(statusData) || `MuAPI speech status failed (${statusResponse.status}).`);
      const status = String(statusData.status || "").toLowerCase();
      if (["failed", "error", "cancelled", "canceled"].includes(status)) throw new Error(providerErrorText(statusData) || "MuAPI speech generation failed.");
      if (["completed", "succeeded", "success"].includes(status)) result = statusData;
      if (Date.now() >= deadline) throw new Error("MuAPI speech generation timed out.");
    } while (!result);
    const outputUrl = findAudioUrl(result);
    if (!outputUrl) throw new Error("MuAPI speech completed without returning an audio URL.");
    const stored = await downloadRemoteToTempFile(outputUrl);
    const audioBytes = await readFile(stored.localPath);
    return { audioPath: stored.localPath, audioUrl: `data:${stored.mimeType};base64,${audioBytes.toString("base64")}`, cleanup: stored.cleanup, duration: estimateDuration(cleanText), provider: "muapi", voice: voiceId, language: languageCode, style: style || "Natural", requestId };
  }
}

function findAudioUrl(value) {
  const urls = [];
  const visit = (item, path = "") => {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) {
      const isAudioPath = /\.(mp3|wav|m4a|ogg|aac|flac)(?:\?|$)/i.test(item);
      if (isAudioPath || /audio|sound|speech|output/i.test(path)) urls.push(item);
    }
    else if (Array.isArray(item)) item.forEach((entry, index) => visit(entry, `${path}.${index}`));
    else if (item && typeof item === "object") Object.entries(item).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(value);
  return urls[0] || null;
}

function estimateDuration(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(45, Number((words / 2.2).toFixed(1))));
}

export const muApiTtsProvider = new MuApiTtsProvider();