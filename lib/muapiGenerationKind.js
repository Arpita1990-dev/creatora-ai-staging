import {
  audioModels,
  i2iModels,
  i2vModels,
  lipsyncModels,
  motionControlModels,
  recastModels,
  t2iModels,
  t2vModels,
  v2vModels,
} from "../packages/studio/src/models.js";

const videoModels = [...t2vModels, ...i2vModels, ...v2vModels, ...lipsyncModels, ...recastModels, ...motionControlModels];
const imageModels = [...t2iModels, ...i2iModels];
const videoTools = new Set(["ai-clipping", "motion-graphics", "motion-graphics-edit", "sd-2-vip-omni-reference-1080p", "seedance-2-vip-omni-reference"]);
const imageTools = new Set(["ai-image-upscale", "ai-image-upscaler", "ai-background-remover", "ai-image-extension", "seedvr2-image-upscale", "topaz-image-upscale"]);

function modelMatches(models, endpoint) {
  return models.some((model) => model.id === endpoint || model.endpoint === endpoint);
}

export function muApiGenerationKind(path) {
  const endpoint = String(path || "").split("/").filter(Boolean).at(-1) || "";
  if (videoTools.has(endpoint) || modelMatches(videoModels, endpoint)) return "VIDEO";
  if (imageTools.has(endpoint) || modelMatches(imageModels, endpoint)) return "IMAGE";
  if (modelMatches(audioModels, endpoint)) return "AUDIO";
  return null;
}