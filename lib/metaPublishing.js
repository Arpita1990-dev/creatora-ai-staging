import { decryptToken } from "./tokenEncryption.js";
import { mediaUrlForWorkspace } from "./mediaDelivery.js";

const GRAPH_URL = "https://graph.facebook.com";

async function absoluteMediaUrl(request, value, workspaceId) {
  if (String(value || "").startsWith("supabase://")) return mediaUrlForWorkspace(value, workspaceId, 600);
  const url = new URL(value, new URL(request.url).origin);
  if (!/^https:$/.test(url.protocol) && url.hostname !== "localhost") {
    throw new Error("Meta requires a public HTTPS media URL.");
  }
  if (["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Meta cannot download media from localhost. Use a public HTTPS application URL before publishing.");
  }
  return url.toString();
}

async function graphRequest(path, params, method = "POST") {
  const url = new URL(`${process.env.META_GRAPH_URL || GRAPH_URL}/${path.replace(/^\//, "")}`);
  const options = { method, cache: "no-store" };
  if (method === "GET") url.search = new URLSearchParams(params).toString();
  else {
    options.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    options.body = new URLSearchParams(params);
  }
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error?.message || "Meta publishing failed.");
  return result;
}

async function pageToken(userToken, pageId) {
  const result = await graphRequest("me/accounts", { fields: "id,access_token", access_token: userToken }, "GET");
  const page = result.data?.find((item) => String(item.id) === String(pageId));
  if (!page?.access_token) throw new Error("The selected Facebook Page is no longer available to this connection.");
  return page.access_token;
}

export async function publishFacebook({ request, connection, asset, caption, pageId }) {
  if (!pageId) throw new Error("Select a Facebook Page.");
  const mediaUrl = await absoluteMediaUrl(request, asset.outputUrl, asset.storageWorkspaceId);
  const accessToken = await pageToken(decryptToken(connection.accessTokenEncrypted), pageId);
  const video = asset.assetType === "VIDEO";
  const result = await graphRequest(`${pageId}/${video ? "videos" : "photos"}`, {
    [video ? "file_url" : "url"]: mediaUrl,
    [video ? "description" : "caption"]: caption,
    access_token: accessToken,
  });
  const id = String(result.post_id || result.id || "");
  return { id, url: id ? `https://www.facebook.com/${id}` : null };
}

export async function publishInstagram({ request, connection, asset, caption, instagramAccountId }) {
  if (!instagramAccountId) throw new Error("Select an Instagram Business account.");
  const mediaUrl = await absoluteMediaUrl(request, asset.outputUrl, asset.storageWorkspaceId);
  const accessToken = decryptToken(connection.accessTokenEncrypted);
  const video = asset.assetType === "VIDEO";
  const container = await graphRequest(`${instagramAccountId}/media`, {
    [video ? "video_url" : "image_url"]: mediaUrl,
    ...(video ? { media_type: "REELS" } : {}),
    caption,
    access_token: accessToken,
  });
  if (!container.id) throw new Error("Instagram did not create a media container.");
  if (video) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const status = await graphRequest(container.id, { fields: "status_code,status", access_token: accessToken }, "GET");
      if (status.status_code === "FINISHED") break;
      if (["ERROR", "EXPIRED"].includes(status.status_code)) throw new Error(status.status || "Instagram could not process the video.");
      if (attempt === 19) throw new Error("Instagram is still processing the video. Please try publishing again shortly.");
    }
  }
  const published = await graphRequest(`${instagramAccountId}/media_publish`, { creation_id: container.id, access_token: accessToken });
  const id = String(published.id || "");
  let permalink = null;
  if (id) {
    try {
      permalink = (await graphRequest(id, { fields: "permalink", access_token: accessToken }, "GET")).permalink || null;
    } catch {}
  }
  return { id, url: permalink };
}
