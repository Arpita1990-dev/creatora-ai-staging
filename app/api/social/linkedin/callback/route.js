import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/tokenEncryption";
import { callbackOrganization, findPendingSocialConnection, socialDashboardUrl } from "@/lib/socialConnectionScope";
import { persistSocialConnection } from "@/lib/socialConnectionPersistence";
import { destinationRecordsFromMetadata, partitionNewDestinations, syncDestinations } from "@/lib/socialDestinations";
import { safeSocialError } from "@/lib/socialErrorSanitizer";

const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

function linkedinHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202609", "X-Restli-Protocol-Version": "2.0.0" };
}

async function discoverOrganizations(accessToken, scopes) {
  if (!scopes.includes("r_organization_admin") || !scopes.includes("w_organization_social")) return [];
  const base = process.env.LINKEDIN_API_BASE || "https://api.linkedin.com/rest";
  const response = await fetch(`${base}/organizationAcls?q=roleAssignee&state=APPROVED&count=100&start=0`, { headers: linkedinHeaders(accessToken), cache: "no-store" });
  const body = await jsonResponse(response, "LinkedIn organization lookup failed.");
  const urns = [...new Set((body.elements || []).filter((item) => ["ADMINISTRATOR", "CONTENT_ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER"].includes(item.role) && item.state === "APPROVED").map((item) => item.organization || item.organizationTarget).filter((urn) => /^urn:li:organization:\d+$/.test(urn)))];
  return Promise.all(urns.map(async (urn) => {
    const id = urn.split(":").at(-1);
    const detailsResponse = await fetch(`${base}/organizations/${id}`, { headers: linkedinHeaders(accessToken), cache: "no-store" });
    const details = detailsResponse.ok ? await detailsResponse.json().catch(() => ({})) : {};
    return { id: urn, type: "ORGANIZATION", name: details.localizedName || details.vanityName || `LinkedIn organization ${id}` };
  }));
}

async function jsonResponse(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.message || fallback);
  return body;
}

export async function GET(request) {
  let connection;
  let state = "";
  try {
    const callbackUrl = new URL(request.url);
    state = callbackUrl.searchParams.get("state") || "";
    if (callbackUrl.searchParams.get("error")) throw new Error(callbackUrl.searchParams.get("error_description") || "LinkedIn authorization was cancelled.");
    const code = callbackUrl.searchParams.get("code");
    if (!code || !state) throw new Error("The LinkedIn authorization response is incomplete.");
    const { user } = await callbackOrganization(request, "LinkedIn");
    connection = await findPendingSocialConnection("LINKEDIN", state, user.sub);
    if (!connection) throw new Error("The LinkedIn connection request expired. Please try again.");
    if ((connection.organizationId && connection.organizationId !== user.organizationId) || (connection.userId && connection.userId !== user.sub)) throw new Error("The LinkedIn connection does not belong to this workspace.");
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || new URL("/api/social/linkedin/callback", callbackUrl.origin).toString();
    if (!clientId || !clientSecret) throw new Error("LinkedIn OAuth credentials are not configured.");
    const tokenResponse = await fetch(process.env.LINKEDIN_TOKEN_URL || TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
      cache: "no-store",
    });
    const tokens = await jsonResponse(tokenResponse, "LinkedIn token exchange failed.");
    if (!tokens.access_token) throw new Error("LinkedIn did not return an access token.");
    const profileResponse = await fetch(process.env.LINKEDIN_USERINFO_URL || USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    const profile = await jsonResponse(profileResponse, "LinkedIn profile lookup failed.");
    if (!profile.sub) throw new Error("LinkedIn did not return a member identifier.");
    const grantedScopes = String(tokens.scope || "").split(/[ ,]+/).filter(Boolean);
    const requestedScopes = JSON.parse(connection.scopes || "[]");
    const scopes = grantedScopes.length ? grantedScopes : requestedScopes;
    if (!scopes.includes("w_member_social") && !scopes.includes("w_organization_social")) throw new Error("LinkedIn did not grant publishing permission.");
    const organizations = await discoverOrganizations(tokens.access_token, scopes).catch((error) => {
      console.error("LinkedIn organization discovery failed:", error.message);
      return [];
    });
    const destinations = [...(scopes.includes("w_member_social") ? [{ id: `urn:li:person:${profile.sub}`, type: "MEMBER", name: profile.name || "LinkedIn profile" }] : []), ...organizations];
    const metadata = { profile: { name: profile.name, email: profile.email, picture: profile.picture }, destinations };
    const connected = await persistSocialConnection(connection, profile.sub, {
      accountName: profile.name || "LinkedIn",
      accessTokenEncrypted: encryptToken(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
      scopes: JSON.stringify(scopes),
      metadata: JSON.stringify(metadata),
    });
    connection = connected;
    // The member profile and any approved organizations become separate
    // destination rows, each individually connectable and disconnectable.
    const { records, duplicates } = await partitionNewDestinations(
      connected,
      destinationRecordsFromMetadata("LINKEDIN", metadata).records
    );
    await syncDestinations(connected, records, { authoritative: true });
    const duplicateNote = duplicates.length
      ? ` ${duplicates.map((item) => item.accountName).join(", ")} ${duplicates.length === 1 ? "is" : "are"} already connected to this workspace.`
      : "";
    return NextResponse.redirect(socialDashboardUrl(request, "linkedin", "connected", duplicateNote || null));
  } catch (error) {
    const safeError = safeSocialError(error, "LinkedIn connection failed.");
    if (!connection && state) connection = await findPendingSocialConnection("LINKEDIN", state).catch(() => null);
    if (connection?.id) await prisma.socialConnection.update({ where: { id: connection.id }, data: { status: "ERROR", providerAccountId: null, metadata: JSON.stringify({ error: safeError }) } }).catch(() => {});
    console.error("LinkedIn OAuth callback failed:", safeError);
    return NextResponse.redirect(socialDashboardUrl(request, "linkedin", "error", safeError));
  }
}
