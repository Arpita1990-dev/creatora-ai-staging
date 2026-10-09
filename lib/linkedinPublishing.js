import { decryptToken } from "./tokenEncryption.js";
import { downloadPublishAsset } from "./socialMediaDownload.js";

const API_BASE = "https://api.linkedin.com/rest";

function headers(accessToken, json = true) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202609",
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function linkedinJson(url, options, fallback) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error?.message || fallback);
  return { response, body };
}

async function uploadImage(accessToken, owner, media) {
  const { body } = await linkedinJson(`${process.env.LINKEDIN_API_BASE || API_BASE}/images?action=initializeUpload`, {
    method: "POST", headers: headers(accessToken), body: JSON.stringify({ initializeUploadRequest: { owner } }),
  }, "LinkedIn could not initialize the image upload.");
  const value = body.value || {};
  if (!value.uploadUrl || !value.image) throw new Error("LinkedIn returned an incomplete image upload response.");
  const uploaded = await fetch(value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": media.contentType }, body: media.buffer });
  if (!uploaded.ok) throw new Error(`LinkedIn image upload failed (${uploaded.status}).`);
  return value.image;
}

async function uploadVideo(accessToken, owner, media) {
  const base = process.env.LINKEDIN_API_BASE || API_BASE;
  const { body } = await linkedinJson(`${base}/videos?action=initializeUpload`, {
    method: "POST", headers: headers(accessToken), body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: media.buffer.length, uploadCaptions: false, uploadThumbnail: false } }),
  }, "LinkedIn could not initialize the video upload.");
  const value = body.value || {};
  if (!value.video || !value.uploadInstructions?.length) throw new Error("LinkedIn returned an incomplete video upload response.");
  const uploadedPartIds = [];
  for (const instruction of value.uploadInstructions) {
    const first = Number(instruction.firstByte || 0);
    const last = Math.min(Number(instruction.lastByte ?? media.buffer.length - 1), media.buffer.length - 1);
    const uploaded = await fetch(instruction.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: media.buffer.subarray(first, last + 1) });
    if (!uploaded.ok) throw new Error(`LinkedIn video upload failed (${uploaded.status}).`);
    const etag = uploaded.headers.get("etag");
    if (!etag) throw new Error("LinkedIn video upload did not return a part identifier.");
    uploadedPartIds.push(etag.replace(/^"|"$/g, ""));
  }
  await linkedinJson(`${base}/videos?action=finalizeUpload`, {
    method: "POST", headers: headers(accessToken), body: JSON.stringify({ finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken || "", uploadedPartIds } }),
  }, "LinkedIn could not finalize the video upload.");
  return value.video;
}

export async function publishLinkedIn({ request, connection, asset, caption, destinationId }) {
  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() <= Date.now()) {
    throw new Error("Reconnect LinkedIn to renew its publishing permission.");
  }
  let scopes = [];
  try { scopes = JSON.parse(connection.scopes || "[]"); } catch {}
  const requiredScope = destinationId.startsWith("urn:li:organization:") ? "w_organization_social" : "w_member_social";
  if (!scopes.includes(requiredScope)) throw new Error(`Reconnect LinkedIn with ${requiredScope} permission to publish to this destination.`);
  const accessToken = decryptToken(connection.accessTokenEncrypted);
  const media = await downloadPublishAsset(request, asset);
  const mediaUrn = asset.assetType === "VIDEO"
    ? await uploadVideo(accessToken, destinationId, media)
    : await uploadImage(accessToken, destinationId, media);
  const payload = {
    author: destinationId,
    commentary: caption || "",
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: mediaUrn } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const { response } = await linkedinJson(`${process.env.LINKEDIN_API_BASE || API_BASE}/posts`, {
    method: "POST", headers: headers(accessToken), body: JSON.stringify(payload),
  }, "LinkedIn publishing failed.");
  const id = response.headers.get("x-restli-id") || "";
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : null };
}
