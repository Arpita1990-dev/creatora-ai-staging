import test from "node:test";
import assert from "node:assert/strict";

import { discoverMetaAccounts } from "../lib/metaDiscovery.js";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("discovers and normalizes the Instagram business account for each Page", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/me/permissions")) return jsonResponse({ data: [
      { permission: "pages_show_list", status: "granted" },
      { permission: "pages_read_engagement", status: "granted" },
      { permission: "instagram_basic", status: "granted" },
    ] });
    if (parsed.pathname.endsWith("/me/accounts")) return jsonResponse({ data: [{ id: "page-1", name: "Science Beyond the Ordinary", access_token: "page-token" }] });
    return jsonResponse({ instagram_business_account: { id: "ig-1", username: "arpita.ghadei9", name: "Arpita" } });
  };
  try {
    const result = await discoverMetaAccounts("user-token");
    assert.deepEqual(result.pages, [{ id: "page-1", name: "Science Beyond the Ordinary" }]);
    assert.deepEqual(result.instagramAccounts, [{ id: "ig-1", username: "arpita.ghadei9", name: "Arpita", pageId: "page-1", pageName: "Science Beyond the Ordinary" }]);
    assert.equal(result.discovery.status, "DISCOVERED");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("returns MISSING_PERMISSION instead of silently treating a Graph error as no account", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/me/permissions")) return jsonResponse({ data: [{ permission: "pages_show_list", status: "granted" }] });
    if (parsed.pathname.endsWith("/me/accounts")) return jsonResponse({ data: [{ id: "page-1", name: "Science Beyond the Ordinary", access_token: "page-token" }] });
    return jsonResponse({ error: { code: 10, message: "Application does not have permission for this action" } }, 403);
  };
  try {
    const result = await discoverMetaAccounts("user-token");
    assert.deepEqual(result.instagramAccounts, []);
    assert.equal(result.discovery.status, "MISSING_PERMISSION");
    assert.equal(result.discovery.pages[0].error.code, "10");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("returns NO_LINKED_INSTAGRAM_ACCOUNT for a successful empty Page lookup", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/me/permissions")) return jsonResponse({ data: [
      { permission: "pages_show_list", status: "granted" },
      { permission: "pages_read_engagement", status: "granted" },
      { permission: "instagram_basic", status: "granted" },
    ] });
    if (parsed.pathname.endsWith("/me/accounts")) return jsonResponse({ data: [{ id: "page-1", name: "Science Beyond the Ordinary", access_token: "page-token" }] });
    return jsonResponse({ id: "page-1" });
  };
  try {
    const result = await discoverMetaAccounts("user-token");
    assert.equal(result.discovery.status, "NO_LINKED_INSTAGRAM_ACCOUNT");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
