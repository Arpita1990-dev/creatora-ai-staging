import { mediaBytesForWorkspace } from "./mediaDelivery.js";

const MAX_MEDIA_BYTES = 256 * 1024 * 1024;

export async function downloadPublishAsset(request, asset) {
  if (String(asset.outputUrl || "").startsWith("supabase://")) {
    const buffer = await mediaBytesForWorkspace(asset.outputUrl, asset.storageWorkspaceId);
    if (!buffer.length) throw new Error("The publishing asset is empty.");
    if (buffer.length > MAX_MEDIA_BYTES) throw new Error("The publishing asset exceeds the 256 MB upload limit.");
    const extension = asset.outputUrl.split(".").at(-1)?.toLowerCase();
    const fallback = asset.assetType === "VIDEO" ? "video/mp4" : "image/jpeg";
    const contentType = ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" })[extension] || fallback;
    return { buffer, contentType };
  }
  const sourceUrl = /^https?:\/\//i.test(asset.outputUrl || "")
    ? asset.outputUrl
    : new URL(asset.outputUrl, new URL(request.url).origin).toString();
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to read the publishing asset (${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_MEDIA_BYTES) throw new Error("The publishing asset exceeds the 256 MB upload limit.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("The publishing asset is empty.");
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error("The publishing asset exceeds the 256 MB upload limit.");
  const fallback = asset.assetType === "VIDEO" ? "video/mp4" : "image/jpeg";
  return { buffer, contentType: response.headers.get("content-type")?.split(";")[0] || fallback };
}
