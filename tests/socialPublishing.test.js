import test from "node:test";
import assert from "node:assert/strict";

import { publishLinkedIn } from "../lib/linkedinPublishing.js";
import { publishYouTube, youtubeAccessToken } from "../lib/youtubePublishing.js";
import { encryptToken } from "../lib/tokenEncryption.js";

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function tokenEnvironment() {
  const previous = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = "test-only-social-publishing-key";
  return () => previous == null ? delete process.env.TOKEN_ENCRYPTION_KEY : (process.env.TOKEN_ENCRYPTION_KEY = previous);
}

test("publishes an image to the authorized LinkedIn member destination", async () => {
  const restoreKey = tokenEnvironment();
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url) === "https://cdn.example/image.jpg") return new Response(Buffer.from("image-bytes"), { headers: { "content-type": "image/jpeg" } });
    if (String(url).includes("/images?action=initializeUpload")) return json({ value: { uploadUrl: "https://upload.example/image", image: "urn:li:image:test" } });
    if (String(url) === "https://upload.example/image") return new Response(null, { status: 201 });
    if (String(url).endsWith("/posts")) return json({}, 201, { "x-restli-id": "urn:li:share:42" });
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const result = await publishLinkedIn({ request: new Request("https://app.example/api/publish-jobs"), connection: { accessTokenEncrypted: encryptToken("linkedin-token"), scopes: JSON.stringify(["w_member_social"]) }, asset: { assetType: "IMAGE", outputUrl: "https://cdn.example/image.jpg" }, caption: "Launch day", destinationId: "urn:li:person:member-1" });
    assert.equal(result.id, "urn:li:share:42");
    const post = JSON.parse(requests.at(-1).options.body);
    assert.equal(post.author, "urn:li:person:member-1");
    assert.equal(post.content.media.id, "urn:li:image:test");
    assert.equal(requests.at(-1).options.headers.Authorization, "Bearer linkedin-token");
  } finally {
    globalThis.fetch = previousFetch;
    restoreKey();
  }
});

test("rejects LinkedIn publishing without destination permission or with an expired token before uploading", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Media must not be fetched."); };
  const request = new Request("https://app.example/api/publish-jobs");
  const asset = { assetType: "IMAGE", outputUrl: "https://cdn.example/image.jpg" };
  try {
    await assert.rejects(publishLinkedIn({ request, connection: { scopes: JSON.stringify(["w_member_social"]) }, asset, destinationId: "urn:li:organization:42" }), /w_organization_social/);
    await assert.rejects(publishLinkedIn({ request, connection: { scopes: JSON.stringify(["w_member_social"]), tokenExpiresAt: new Date(0) }, asset, destinationId: "urn:li:person:42" }), /Reconnect LinkedIn/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("uploads a video to YouTube with title, description and privacy", async () => {
  const restoreKey = tokenEnvironment();
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url) === "https://cdn.example/video.mp4") return new Response(Buffer.from("video-bytes"), { headers: { "content-type": "video/mp4" } });
    if (String(url).includes("upload/youtube/v3/videos")) return new Response(null, { status: 200, headers: { location: "https://upload.youtube.example/session" } });
    if (String(url) === "https://upload.youtube.example/session") return json({ id: "video-42", snippet: { channelId: "channel-1" } });
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const result = await publishYouTube({ request: new Request("https://app.example/api/publish-jobs"), connection: { accessTokenEncrypted: encryptToken("youtube-token"), providerAccountId: "channel-1", tokenExpiresAt: new Date(Date.now() + 3600_000) }, asset: { title: "Asset", assetType: "VIDEO", outputUrl: "https://cdn.example/video.mp4" }, title: "Campaign video", description: "Description", privacyStatus: "unlisted", channelId: "channel-1" });
    assert.equal(result.url, "https://www.youtube.com/watch?v=video-42");
    const metadata = JSON.parse(requests[1].options.body);
    assert.equal(metadata.snippet.title, "Campaign video");
    assert.equal(metadata.status.privacyStatus, "unlisted");
  } finally {
    globalThis.fetch = previousFetch;
    restoreKey();
  }
});

test("rejects a YouTube channel not owned by the selected connection before uploading", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Media must not be fetched."); };
  try {
    await assert.rejects(publishYouTube({ request: new Request("https://app.example/api/publish-jobs"), connection: { providerAccountId: "channel-1" }, asset: { assetType: "VIDEO" }, channelId: "channel-2" }), /connected YouTube channel/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("refreshes an expired YouTube access token server-side", async () => {
  const restoreKey = tokenEnvironment();
  const previousFetch = globalThis.fetch;
  const previousId = process.env.YOUTUBE_CLIENT_ID;
  const previousSecret = process.env.YOUTUBE_CLIENT_SECRET;
  process.env.YOUTUBE_CLIENT_ID = "client";
  process.env.YOUTUBE_CLIENT_SECRET = "secret";
  globalThis.fetch = async () => json({ access_token: "refreshed-token", expires_in: 3600 });
  let update;
  try {
    const token = await youtubeAccessToken({ accessTokenEncrypted: encryptToken("expired"), refreshTokenEncrypted: encryptToken("refresh-token"), tokenExpiresAt: new Date(0) }, (value) => { update = value; });
    assert.equal(token, "refreshed-token");
    assert.ok(update.accessTokenEncrypted);
    assert.ok(update.tokenExpiresAt > new Date());
  } finally {
    globalThis.fetch = previousFetch;
    previousId == null ? delete process.env.YOUTUBE_CLIENT_ID : (process.env.YOUTUBE_CLIENT_ID = previousId);
    previousSecret == null ? delete process.env.YOUTUBE_CLIENT_SECRET : (process.env.YOUTUBE_CLIENT_SECRET = previousSecret);
    restoreKey();
  }
});
