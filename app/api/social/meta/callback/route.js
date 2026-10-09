import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/tokenEncryption";
import { callbackOrganization, findPendingSocialConnection, socialDashboardUrl } from "@/lib/socialConnectionScope";
import { persistSocialConnection } from "@/lib/socialConnectionPersistence";
import { discoverMetaAccounts } from "@/lib/metaDiscovery";
import { destinationRecordsFromMetadata, partitionNewDestinations, syncDestinations } from "@/lib/socialDestinations";

const TOKEN_URL = "https://graph.facebook.com/oauth/access_token";
const GRAPH_URL = "https://graph.facebook.com";

function dashboardUrl(request, status, message) {
  const url = new URL("/dashboard/settings", new URL(request.url).origin);
  url.searchParams.set("meta", status);
  if (message) url.searchParams.set("message", message);
  return url;
}

async function graphJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error?.message || "Meta returned an invalid response.");
  return result;
}

async function callbackParams(request) {
  if (request.method === "POST") {
    const form = await request.formData();
    return new URLSearchParams(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
  }
  return new URL(request.url).searchParams;
}

async function handleCallback(request) {
  let connection;
  let state = "";
  try {
    const callbackUrl = new URL(request.url);
    const params = await callbackParams(request);
    state = params.get("state") || "";
    if (params.get("error")) throw new Error(params.get("error_description") || "Meta authorization was cancelled.");
    const code = params.get("code");
    if (!code || !state) throw new Error("The Meta authorization response is incomplete.");

    const { user } = await callbackOrganization(request, "Meta");
    connection = await findPendingSocialConnection("META", state, user.sub);
    if (!connection) throw new Error("The Meta connection request expired. Please try again.");

    const clientId = process.env.META_CLIENT_ID;
    const clientSecret = process.env.META_CLIENT_SECRET;
    if (!clientId || !/^[a-f\d]{32}$/i.test(String(clientSecret || ""))) throw new Error("Meta OAuth credentials are not configured correctly.");
    const redirectUri = process.env.META_REDIRECT_URI || new URL("/api/social/meta/callback", callbackUrl.origin).toString();
    const tokenUrl = new URL(process.env.META_TOKEN_URL || TOKEN_URL);
    tokenUrl.search = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }).toString();
    const tokens = await graphJson(tokenUrl);
    if (!tokens.access_token) throw new Error("Meta did not return an access token.");

    let accessToken = tokens.access_token;
    let expiresIn = Number(tokens.expires_in || 0);
    const exchangeUrl = new URL(process.env.META_TOKEN_URL || TOKEN_URL);
    exchangeUrl.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: clientId, client_secret: clientSecret, fb_exchange_token: accessToken }).toString();
    try {
      const longLived = await graphJson(exchangeUrl);
      if (longLived.access_token) accessToken = longLived.access_token;
      if (longLived.expires_in) expiresIn = Number(longLived.expires_in);
    } catch {}

    const graphBase = process.env.META_GRAPH_URL || GRAPH_URL;
    const profileUrl = new URL(`${graphBase}/me`);
    profileUrl.search = new URLSearchParams({ fields: "id,name", access_token: accessToken }).toString();
    const profile = await graphJson(profileUrl);
    const { pages, instagramAccounts, discovery } = await discoverMetaAccounts(accessToken);
    const accountScope = connection.organizationId ? { organizationId: connection.organizationId } : { userId: connection.userId, organizationId: null };
    const existing = await prisma.socialConnection.findFirst({
      where: { ...accountScope, provider: "META", providerAccountId: String(profile.id), status: "CONNECTED", id: { not: connection.id } },
    });
    if (existing) {
      // Leave no orphan pending row behind when the same Facebook login is
      // authorized twice in one workspace.
      await prisma.socialConnection.update({ where: { id: connection.id }, data: { status: "DISCONNECTED", providerAccountId: null, metadata: "{}" } }).catch(() => {});
      return NextResponse.redirect(dashboardUrl(request, "error", "This Facebook/Instagram account is already connected to this workspace."));
    }
    const connected = await persistSocialConnection(connection, profile.id, {
      accountName: profile.name || "Meta",
      accessTokenEncrypted: encryptToken(accessToken),
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      metadata: JSON.stringify({ pages, instagramAccounts, discovery }),
    });
    connection = connected;
    // Every authorized Page and Instagram Business account becomes its own
    // destination row so each can be listed and disconnected on its own.
    const { records, duplicates } = await partitionNewDestinations(
      connected,
      destinationRecordsFromMetadata("META", { pages, instagramAccounts, discovery }).records
    );
    await syncDestinations(connected, records, { authoritative: true });
    const duplicateNote = duplicates.length
      ? ` ${duplicates.map((item) => item.accountName).join(", ")} ${duplicates.length === 1 ? "is" : "are"} already connected to this workspace.`
      : "";
    return NextResponse.redirect(dashboardUrl(request, "connected", duplicateNote || null));
  } catch (error) {
    if (!connection && state) connection = await findPendingSocialConnection("META", state).catch(() => null);
    if (connection?.id) {
      let metadata = {};
      try { metadata = JSON.parse(connection.metadata || "{}"); } catch {}
      await prisma.socialConnection.update({ where: { id: connection.id }, data: { status: "ERROR", providerAccountId: null, metadata: JSON.stringify({ ...metadata, error: error.message || "Meta connection failed." }) } }).catch(() => {});
    }
    console.error("Meta OAuth callback failed:", error.message);
    return NextResponse.redirect(dashboardUrl(request, "error", error.message || "Meta connection failed."));
  }
}

export const GET = handleCallback;
export const POST = handleCallback;
