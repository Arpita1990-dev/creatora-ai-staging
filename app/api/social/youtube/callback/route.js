import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/tokenEncryption";
import { callbackOrganization, findPendingSocialConnection, socialDashboardUrl } from "@/lib/socialConnectionScope";
import { persistSocialConnection } from "@/lib/socialConnectionPersistence";
import { destinationRecordsFromMetadata, partitionNewDestinations, syncDestinations } from "@/lib/socialDestinations";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true";

async function jsonResponse(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error_description || body.error?.message || fallback);
    error.httpStatus = response.status;
    error.googleError = typeof body.error === "string" ? body.error : body.error?.status || body.error?.code || null;
    error.googleErrorDescription = body.error_description || body.error?.message || null;
    throw error;
  }
  return body;
}

export async function GET(request) {
  let connection;
  let state = "";
  let stage = "callback_parameters";
  let stateValidated = false;
  let requestedScopes = [];
  let redirectUri = null;
  let tokenExchangeStatus = null;
  let refreshTokenReceived = false;
  let channelLookupStatus = null;
  let channelCount = null;
  let databaseStatus = "not_started";
  let googleError = null;
  let googleErrorDescription = null;
  try {
    const callbackUrl = new URL(request.url);
    state = callbackUrl.searchParams.get("state") || "";
    if (callbackUrl.searchParams.get("error")) {
      googleError = callbackUrl.searchParams.get("error");
      googleErrorDescription = callbackUrl.searchParams.get("error_description");
      throw new Error(googleErrorDescription || "YouTube authorization was cancelled.");
    }
    const code = callbackUrl.searchParams.get("code");
    if (!code || !state) throw new Error("The YouTube authorization response is incomplete.");
    stage = "state_validation";
    const { user } = await callbackOrganization(request, "YouTube");
    connection = await findPendingSocialConnection("YOUTUBE", state, user.sub);
    stateValidated = Boolean(connection);
    console.info("YouTube OAuth diagnostic", { stage, stateValidated });
    if (!connection) throw new Error("The YouTube connection request expired. Please try again.");
    if ((connection.organizationId && connection.organizationId !== user.organizationId) || (connection.userId && connection.userId !== user.sub)) throw new Error("The YouTube connection does not belong to this workspace.");
    try { requestedScopes = JSON.parse(connection.scopes || "[]"); } catch {}
    const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    redirectUri = process.env.YOUTUBE_REDIRECT_URI || new URL("/api/social/youtube/callback", callbackUrl.origin).toString();
    if (!clientId || !clientSecret) throw new Error("YouTube OAuth credentials are not configured.");
    stage = "token_exchange";
    const tokenResponse = await fetch(process.env.YOUTUBE_TOKEN_URL || TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      cache: "no-store",
    });
    tokenExchangeStatus = tokenResponse.status;
    let tokens;
    try {
      tokens = await jsonResponse(tokenResponse, "YouTube token exchange failed.");
    } catch (error) {
      googleError = error.googleError || null;
      googleErrorDescription = error.googleErrorDescription || null;
      throw error;
    }
    refreshTokenReceived = Boolean(tokens.refresh_token);
    console.info("YouTube OAuth diagnostic", { stage, httpStatus: tokenExchangeStatus, requestedScopes, redirectUri, refreshTokenReceived });
    if (!tokens.access_token) throw new Error("Google did not return a YouTube access token.");
    stage = "channel_lookup";
    const channelResponse = await fetch(process.env.YOUTUBE_CHANNELS_URL || CHANNELS_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    channelLookupStatus = channelResponse.status;
    let channelData;
    try {
      channelData = await jsonResponse(channelResponse, "YouTube channel lookup failed.");
    } catch (error) {
      googleError = error.googleError || null;
      googleErrorDescription = error.googleErrorDescription || null;
      throw error;
    }
    const channels = (channelData.items || []).map((item) => ({ id: String(item.id), title: item.snippet?.title || "YouTube channel", thumbnail: item.snippet?.thumbnails?.default?.url || null }));
    channelCount = channels.length;
    console.info("YouTube OAuth diagnostic", { stage, channelLookupStatus, channelCount });
    if (!channels.length) throw new Error("No YouTube channel was found for this Google account. Create a YouTube channel for this account, then reconnect.");
    const accountScope = connection.organizationId ? { organizationId: connection.organizationId } : { userId: connection.userId, organizationId: null };
    const existing = await prisma.socialConnection.findFirst({
      where: { ...accountScope, provider: "YOUTUBE", providerAccountId: channels[0].id, status: "CONNECTED", id: { not: connection.id } },
    });
    if (existing) {
      await prisma.socialConnection.update({ where: { id: connection.id }, data: { status: "DISCONNECTED", providerAccountId: null, metadata: "{}" } }).catch(() => {});
      return NextResponse.redirect(socialDashboardUrl(request, "youtube", "error", "This YouTube channel is already connected to this workspace."));
    }
    const metadata = { channels };
    const connected = await persistSocialConnection(connection, channels[0].id, {
      accountName: channels[0].title,
      accessTokenEncrypted: encryptToken(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
      scopes: JSON.stringify(String(tokens.scope || "").split(/[ ,]+/).filter(Boolean)),
      metadata: JSON.stringify(metadata),
    });
    connection = connected;
    // Every channel this Google login can publish to becomes its own connection
    // identity, so two channels no longer collapse into channels[0].
    const { records, duplicates } = await partitionNewDestinations(
      connected,
      destinationRecordsFromMetadata("YOUTUBE", metadata).records
    );
    await syncDestinations(connected, records, { authoritative: true });
    databaseStatus = "connected_record_persisted";
    console.info("YouTube OAuth diagnostic", { stage, databaseStatus, connectedDestinations: records.length, duplicateDestinations: duplicates.length });
    const duplicateNote = duplicates.length
      ? ` ${duplicates.map((item) => item.accountName).join(", ")} ${duplicates.length === 1 ? "is" : "are"} already connected to this workspace.`
      : "";
    return NextResponse.redirect(socialDashboardUrl(request, "youtube", "connected", duplicateNote || null));
  } catch (error) {
    googleError = googleError || error.googleError || null;
    googleErrorDescription = googleErrorDescription || error.googleErrorDescription || null;
    if (!connection && state) connection = await findPendingSocialConnection("YOUTUBE", state).catch(() => null);
    if (connection?.id) {
      await prisma.socialConnection.update({ where: { id: connection.id }, data: { status: "ERROR", providerAccountId: null, metadata: JSON.stringify({ error: error.message }) } })
        .then(() => { databaseStatus = "error_record_persisted"; })
        .catch(() => { databaseStatus = "error_record_persist_failed"; });
    }
    const httpStatus = stage === "channel_lookup" ? channelLookupStatus : tokenExchangeStatus || error.httpStatus || null;
    console.error("YouTube OAuth diagnostic", { stage, httpStatus, googleError, googleErrorDescription, requestedScopes, redirectUri, stateValidated, channelLookupStatus, channelCount, refreshTokenReceived, databaseStatus });
    return NextResponse.redirect(socialDashboardUrl(request, "youtube", "error", error.message || "YouTube connection failed."));
  }
}
