import { decryptToken, encryptToken } from "./tokenEncryption.js";
import { downloadPublishAsset } from "./socialMediaDownload.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

async function googleJson(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error?.message || fallback);
  return body;
}

export async function youtubeAccessToken(connection, onRefresh) {
  const stillValid = connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() > Date.now() + 60_000;
  if (stillValid) return decryptToken(connection.accessTokenEncrypted);
  if (!connection.refreshTokenEncrypted) throw new Error("Reconnect YouTube to refresh its publishing permission.");
  const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("YouTube OAuth credentials are not configured.");
  const response = await fetch(process.env.YOUTUBE_TOKEN_URL || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: decryptToken(connection.refreshTokenEncrypted), grant_type: "refresh_token" }),
  });
  const tokens = await googleJson(response, "YouTube token refresh failed.");
  if (!tokens.access_token) throw new Error("Google did not return a refreshed access token.");
  const update = { accessTokenEncrypted: encryptToken(tokens.access_token), tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000) };
  await onRefresh?.(update);
  return tokens.access_token;
}

export async function publishYouTube({ request, connection, asset, title, description, privacyStatus, channelId, onRefresh }) {
  if (asset.assetType !== "VIDEO") throw new Error("YouTube publishing requires a video asset.");
  if (!channelId || channelId !== connection.providerAccountId) throw new Error("Select the connected YouTube channel before publishing.");
  const accessToken = await youtubeAccessToken(connection, onRefresh);
  const media = await downloadPublishAsset(request, asset);
  const metadata = { snippet: { title: String(title || asset.title || "CreateoraAI video").slice(0, 100), description: String(description || "").slice(0, 5000) }, status: { privacyStatus } };
  const initialization = await fetch(`${process.env.YOUTUBE_UPLOAD_URL || UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": media.contentType, "X-Upload-Content-Length": String(media.buffer.length) },
    body: JSON.stringify(metadata),
  });
  if (!initialization.ok) await googleJson(initialization, "YouTube could not initialize the video upload.");
  const uploadUrl = initialization.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL.");
  const uploaded = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": media.contentType, "Content-Length": String(media.buffer.length) }, body: media.buffer });
  const video = await googleJson(uploaded, "YouTube video upload failed.");
  if (channelId && video.snippet?.channelId && String(video.snippet.channelId) !== String(channelId)) throw new Error("YouTube returned a different channel than the selected destination.");
  return { id: video.id || "", url: video.id ? `https://www.youtube.com/watch?v=${video.id}` : null };
}
