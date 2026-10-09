import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceEntitlements } from "@/lib/planCatalog";
import {
  assertCanManageSocialConnections,
  canManageSocialConnections,
  disconnectSocialProvider,
  socialAccountScope,
} from "@/lib/socialConnectionScope";
import {
  annotatePlanLimits,
  ensureDestinations,
  listWorkspaceDestinations,
} from "@/lib/socialDestinations";

const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

function settings(request) {
  const origin = new URL(request.url).origin;
  return {
    clientId: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.YOUTUBE_REDIRECT_URI || new URL("/api/social/youtube/callback", origin).toString(),
  };
}

function serialize(connection, entitlement, destinations) {
  if (!connection) return { id: null, provider: "YOUTUBE", connected: false, destinations: [], channels: [] };
  const rows = annotatePlanLimits(destinations, entitlement);
  const usable = rows.filter((row) => !row.overLimit);
  return {
    id: connection.id,
    provider: "YOUTUBE",
    connected: connection.status === "CONNECTED",
    status: connection.status,
    accountName: connection.accountName || "YouTube",
    providerAccountId: connection.providerAccountId,
    // One row per channel, each with its own identity and its own disconnect.
    destinations: rows,
    channels: usable.map((row) => ({ id: row.providerAccountId, title: row.accountName, thumbnail: row.thumbnail })),
    tokenExpiresAt: connection.tokenExpiresAt,
    updatedAt: connection.updatedAt,
  };
}

export async function GET(request) {
  try {
    const scope = await socialAccountScope(request);
    const entitlement = await workspaceEntitlements(prisma, scope.user.organizationId);
    const connections = await prisma.socialConnection.findMany({
      where: { ...scope.where, provider: "YOUTUBE", status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    });
    for (const connection of connections) await ensureDestinations(connection);
    const byConnection = new Map();
    for (const destination of await listWorkspaceDestinations(scope.where)) {
      if (destination.provider !== "YOUTUBE") continue;
      const rows = byConnection.get(destination.socialConnectionId) || [];
      rows.push(destination);
      byConnection.set(destination.socialConnectionId, rows);
    }
    const serialized = connections.map((connection) => serialize(connection, entitlement, byConnection.get(connection.id) || []));
    const oauth = settings(request);
    return NextResponse.json({
      connections: serialized,
      destinations: serialized.flatMap((item) => item.destinations),
      connection: serialized[0] || serialize(null, entitlement, []),
      scope: scope.isOrganization ? "ORGANIZATION" : "PERSONAL",
      canManage: canManageSocialConnections(scope),
      limits: { youtube: entitlement.maxYouTubeAccounts },
      oauth: {
        configured: Boolean(oauth.clientId && oauth.clientSecret && process.env.TOKEN_ENCRYPTION_KEY),
        redirectUri: oauth.redirectUri,
        scopes: SCOPES,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load YouTube connection." }, { status: 401 });
  }
}

export async function POST(request) {
  try {
    const scope = await socialAccountScope(request);
    const entitlement = await workspaceEntitlements(prisma, scope.user.organizationId);
    const limit = Number(entitlement.maxYouTubeAccounts || 0);
    if (!limit) return NextResponse.json({ error: "YouTube publishing requires a paid plan." }, { status: 403 });
    try {
      assertCanManageSocialConnections(scope, "YouTube");
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const used = (await listWorkspaceDestinations(scope.where)).filter((item) => item.provider === "YOUTUBE").length;
    if (used >= limit) {
      return NextResponse.json({ error: `Your plan includes ${limit} YouTube channel${limit === 1 ? "" : "s"}. Disconnect one before connecting another.` }, { status: 403 });
    }
    const oauth = settings(request);
    const missing = [!oauth.clientId && "YOUTUBE_CLIENT_ID (or GOOGLE_CLIENT_ID)", !oauth.clientSecret && "YOUTUBE_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET)", !process.env.TOKEN_ENCRYPTION_KEY && "TOKEN_ENCRYPTION_KEY"].filter(Boolean);
    if (missing.length) return NextResponse.json({ error: `YouTube OAuth is not configured. Add ${missing.join(", ")}.`, redirectUri: oauth.redirectUri }, { status: 501 });
    const state = crypto.randomUUID();
    await prisma.socialConnection.create({ data: { ...scope.data, provider: "YOUTUBE", status: "CONNECTING", connectedBy: scope.user.sub, scopes: JSON.stringify(SCOPES), metadata: JSON.stringify({ state }) } });
    const url = new URL(process.env.YOUTUBE_AUTHORIZATION_URL || AUTHORIZATION_URL);
    url.search = new URLSearchParams({ client_id: oauth.clientId, redirect_uri: oauth.redirectUri, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", include_granted_scopes: "true", prompt: "consent", state }).toString();
    console.info("YouTube OAuth diagnostic", { stage: "authorization_request", redirectUri: oauth.redirectUri, requestedScopes: SCOPES, databaseStatus: "pending_connection_created" });
    return NextResponse.json({ authorizationUrl: url.toString() });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to start YouTube connection." }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    await disconnectSocialProvider(request, "YOUTUBE");
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to disconnect YouTube." }, { status: error.status || 403 });
  }
}