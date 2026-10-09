import test from "node:test";
import assert from "node:assert/strict";

import { encryptToken } from "../lib/tokenEncryption.js";
import { publishFacebook, publishInstagram } from "../lib/metaPublishing.js";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function withMetaToken() {
  const previous = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = "test-only-meta-token-key";
  return {
    connection: { accessTokenEncrypted: encryptToken("user-token") },
    restore: () => previous == null ? delete process.env.TOKEN_ENCRYPTION_KEY : (process.env.TOKEN_ENCRYPTION_KEY = previous),
  };
}

test("publishes an image to a connected Facebook Page", async () => {
  const previousFetch = globalThis.fetch;
  const { connection, restore } = withMetaToken();
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/me/accounts")) return jsonResponse({ data: [{ id: "page-1", access_token: "page-token" }] });
    return jsonResponse({ post_id: "page-1_42" });
  };
  try {
    const result = await publishFacebook({ request: new Request("https://app.example/api/publish-jobs"), connection, asset: { assetType: "IMAGE", outputUrl: "https://cdn.example/ad.jpg" }, caption: "New product", pageId: "page-1" });
    assert.equal(result.id, "page-1_42");
    const body = new URLSearchParams(requests[1].options.body);
    assert.equal(body.get("url"), "https://cdn.example/ad.jpg");
    assert.equal(body.get("access_token"), "page-token");
  } finally {
    globalThis.fetch = previousFetch;
    restore();
  }
});

test("publishes an image to a connected Instagram Business account", async () => {
  const previousFetch = globalThis.fetch;
  const { connection, restore } = withMetaToken();
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/ig-1/media")) return jsonResponse({ id: "container-1" });
    if (String(url).endsWith("/ig-1/media_publish")) return jsonResponse({ id: "media-1" });
    return jsonResponse({ permalink: "https://www.instagram.com/p/example/" });
  };
  try {
    const result = await publishInstagram({ request: new Request("https://app.example/api/publish-jobs"), connection, asset: { assetType: "IMAGE", outputUrl: "https://cdn.example/ad.jpg" }, caption: "New product", instagramAccountId: "ig-1" });
    assert.equal(result.url, "https://www.instagram.com/p/example/");
    const body = new URLSearchParams(requests[0].options.body);
    assert.equal(body.get("image_url"), "https://cdn.example/ad.jpg");
    assert.equal(body.get("access_token"), "user-token");
  } finally {
    globalThis.fetch = previousFetch;
    restore();
  }
});

test("rejects localhost media URLs before calling Meta", async () => {
  const { connection, restore } = withMetaToken();
  try {
    await assert.rejects(() => publishFacebook({ request: new Request("http://localhost:3000/api/publish-jobs"), connection, asset: { assetType: "IMAGE", outputUrl: "/uploads/ad.jpg" }, caption: "Ad", pageId: "page-1" }), /cannot download media from localhost/i);
  } finally {
    restore();
  }
});
