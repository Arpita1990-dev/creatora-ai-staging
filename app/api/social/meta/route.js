import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/tokenEncryption";
import { discoverMetaAccounts } from "@/lib/metaDiscovery";
import { workspaceEntitlements } from "@/lib/planCatalog";
import { socialAccountScope, assertCanManageSocialConnections } from "@/lib/socialConnectionScope";
import {
  annotatePlanLimits,
  destinationRecordsFromMetadata,
  listDestinationsForConnection,
  listWorkspaceDestinations,
  parseMetadata,
  partitionNewDestinations,
  syncDestinations,
} from "@/lib/socialDestinations";

const DEFAULT_AUTHORIZATION_URL = "https://www.facebook.com/dialog/oauth";
function validClientSecret(value) {
  return /^[a-f\d]{32}$/i.test(String(value || ""));
}

function oauthSettings(request) {
  const origin = new URL(request.url).origin;
  return {
    redirectUri: process.env.META_REDIRECT_URI || new URL("/api/social/meta/callback", origin).toString(),
    configurationId: String(process.env.META_CONFIG_ID || "").trim(),
    scopes: String(process.env.META_OAUTH_SCOPES || "").trim(),
  };
}

function serialize(connection, entitlement, destinations) {
  if (!connection) return { connected: false, provider: "META", destinations: [], pages: [], instagramAccounts: [] };
  const metadata = parseMetadata(connection);
  const rows = annotatePlanLimits(destinations, entitlement);
  const usable = rows.filter((row) => !row.overLimit);
  return {
    id: connection.id,
    connected: connection.status === "CONNECTED",
    provider: connection.provider,
    accountName: connection.accountName || "Meta",
    providerAccountId: connection.providerAccountId,
    status: connection.status,
    pages: usable
      .filter((row) => row.accountType === "FACEBOOK_PAGE")
      .map((row) => ({ id: row.providerAccountId, name: row.accountName, picture: row.thumbnail })),
    instagramAccounts: usable
      .filter((row) => row.accountType === "INSTAGRAM_BUSINESS")
      .map((row) => ({ id: row.providerAccountId, username: row.handle, name: row.accountName, pageId: connection.providerAccountId })),
    destinations: rows,
    limits: { facebook: entitlement.maxFacebookAccounts, instagram: entitlement.maxInstagramAccounts },
    discoveryStatus: metadata.discovery?.status || null,
    discovery: metadata.discovery || null,
    tokenExpiresAt: connection.tokenExpiresAt,
    updatedAt: connection.updatedAt,
  };
}

// Keeps the destination rows in step with the live Graph API result. A failed
// discovery only records the diagnostic, it never removes a connected account.
async function refreshDestinations(connection) {
  if (connection.status !== "CONNECTED" || !connection.accessTokenEncrypted) {
    return listDestinationsForConnection(connection.id);
  }
  let discovered;
  try {
    discovered = await discoverMetaAccounts(decryptToken(connection.accessTokenEncrypted));
  } catch (error) {
    const metadata = parseMetadata(connection);
    await prisma.socialConnection.update({
      where: { id: connection.id },
      data: {
        metadata: JSON.stringify({
          ...metadata,
          discovery: {
            status: "META_API_ERROR",
            checkedAt: new Date().toISOString(),
            permissions: metadata.discovery?.permissions || null,
            pages: metadata.discovery?.pages || [],
            error: { code: error.code || null, message: error.message || "Meta Graph API discovery failed." },
          },
        }),
      },
    }).catch(() => {});
    return syncDestinations(connection, destinationRecordsFromMetadata("META", parseMetadata(connection)).records, { authoritative: false });
  }
  const updated = await prisma.socialConnection.update({
    where: { id: connection.id },
    data: { metadata: JSON.stringify(discovered) },
  });
  const { records } = await partitionNewDestinations(updated, destinationRecordsFromMetadata("META", discovered).records);
  return syncDestinations(updated, records, { authoritative: true });
}

export async function GET(request) {
  try {
    const scope = await socialAccountScope(request);
    const entitlement = await workspaceEntitlements(prisma, scope.user.organizationId);
    const oauth = oauthSettings(request);
    const connections = await prisma.socialConnection.findMany({
      where: { ...scope.where, provider: "META", status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    });
    const result = [];
    for (const connection of connections) {
      const destinations = await refreshDestinations(connection);
      result.push(serialize(connection, entitlement, destinations));
    }
    const destinations = result.flatMap((item) => item.destinations);
    return NextResponse.json({
      connections: result,
      destinations,
      scope: scope.isOrganization ? "ORGANIZATION" : "PERSONAL",
      canManage: scope.isOrganization ? assertCanManageSilently(scope) : true,
      oauth: {
        configured: Boolean(process.env.META_CLIENT_ID && validClientSecret(process.env.META_CLIENT_SECRET) && process.env.TOKEN_ENCRYPTION_KEY && (oauth.configurationId || oauth.scopes)),
        mode: oauth.configurationId ? "BUSINESS_LOGIN" : oauth.scopes ? "CLASSIC_LOGIN" : "NOT_CONFIGURED",
        redirectUri: oauth.redirectUri,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load Meta connection." }, { status: 401 });
  }
}

function assertCanManageSilently(scope) {
  try {
    assertCanManageSocialConnections(scope, "Meta");
    return true;
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const scope = await socialAccountScope(request);
    const entitlement = await workspaceEntitlements(prisma, scope.user.organizationId);
    if (!entitlement.maxFacebookAccounts && !entitlement.maxInstagramAccounts) {
      return NextResponse.json({ error: "Social publishing requires Creator, Pro, or Business." }, { status: 403 });
    }
    try {
      assertCanManageSocialConnections(scope, "Meta");
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const clientId = process.env.META_CLIENT_ID;
    const clientSecret = process.env.META_CLIENT_SECRET;
    const oauth = oauthSettings(request);
    const redirectUri = oauth.redirectUri;
    const authorizationUrl = process.env.META_AUTHORIZATION_URL || DEFAULT_AUTHORIZATION_URL;
    const missing = [
      !clientId && "META_CLIENT_ID",
      !clientSecret
        ? "META_CLIENT_SECRET"
        : !validClientSecret(clientSecret) && "a valid META_CLIENT_SECRET (click Show in Meta; do not copy masked bullets)",
      !process.env.TOKEN_ENCRYPTION_KEY && "TOKEN_ENCRYPTION_KEY",
      !oauth.configurationId && !oauth.scopes && "META_CONFIG_ID (recommended) or META_OAUTH_SCOPES",
    ].filter(Boolean);
    if (missing.length) {
      return NextResponse.json({
        error: `Meta OAuth is not configured. Add ${missing.join(", ")} to .env.local, allow-list ${redirectUri} in the Meta app, and restart the server.`,
        redirectUri,
      }, { status: 501 });
    }
    const state = crypto.randomUUID();
    const connected = await listWorkspaceDestinations(scope.where);
    const usedFacebook = connected.filter((item) => item.provider === "META" && item.accountType === "FACEBOOK_PAGE").length;
    const usedInstagram = connected.filter((item) => item.provider === "META" && item.accountType === "INSTAGRAM_BUSINESS").length;
    const facebookFull = Number(entitlement.maxFacebookAccounts || 0) > 0 && usedFacebook >= Number(entitlement.maxFacebookAccounts);
    const instagramFull = Number(entitlement.maxInstagramAccounts || 0) > 0 && usedInstagram >= Number(entitlement.maxInstagramAccounts);
    if (facebookFull && instagramFull) {
      return NextResponse.json({
        error: `Your plan includes ${entitlement.maxFacebookAccounts} Facebook Page${Number(entitlement.maxFacebookAccounts) === 1 ? "" : "s"} and ${entitlement.maxInstagramAccounts} Instagram account${Number(entitlement.maxInstagramAccounts) === 1 ? "" : "s"}. Disconnect one before connecting another.`,
      }, { status: 403 });
    }
    await prisma.socialConnection.create({
      data: {
        ...scope.data,
        provider: "META",
        status: "CONNECTING",
        connectedBy: scope.user.sub,
        metadata: JSON.stringify({ state }),
      },
    });
    const url = new URL(authorizationUrl);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    if (oauth.configurationId) {
      url.searchParams.set("config_id", oauth.configurationId);
      url.searchParams.set("override_default_response_type", "true");
    } else {
      url.searchParams.set("scope", oauth.scopes);
    }
    return NextResponse.json({ authorizationUrl: url.toString() });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to start Meta connection." }, { status: 400 });
  }
}