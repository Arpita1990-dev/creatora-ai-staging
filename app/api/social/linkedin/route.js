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

const AUTHORIZATION_URL = "https://www.linkedin.com/oauth/v2/authorization";
const BASE_SCOPES = ["openid", "profile", "email", "w_member_social"];

function settings(request) {
  const origin = new URL(request.url).origin;
  const extraScopes = String(process.env.LINKEDIN_ADDITIONAL_SCOPES || "").split(/[ ,]+/).filter(Boolean);
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || new URL("/api/social/linkedin/callback", origin).toString(),
    scopes: [...new Set([...BASE_SCOPES, ...extraScopes])],
  };
}

function serialize(connection, entitlement, destinations) {
  if (!connection) return { id: null, provider: "LINKEDIN", connected: false, destinations: [] };
  return {
    id: connection.id,
    provider: "LINKEDIN",
    connected: connection.status === "CONNECTED",
    status: connection.status,
    accountName: connection.accountName || "LinkedIn",
    providerAccountId: connection.providerAccountId,
    // One row per LinkedIn profile or organization this authorization can post to.
    destinations: annotatePlanLimits(destinations, entitlement),
    tokenExpiresAt: connection.tokenExpiresAt,
    updatedAt: connection.updatedAt,
  };
}

export async function GET(request) {
  try {
    const scope = await socialAccountScope(request);
    const entitlement = await workspaceEntitlements(prisma, scope.user.organizationId);
    const connections = await prisma.socialConnection.findMany({
      where: { ...scope.where, provider: "LINKEDIN", status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    });
    // Lazily backfill destination rows for connections created before
    // multi-account destinations existed, so existing users keep their accounts.
    for (const connection of connections) await ensureDestinations(connection);
    const byConnection = new Map();
    for (const destination of await listWorkspaceDestinations(scope.where)) {
      if (destination.provider !== "LINKEDIN") continue;
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
      limits: { linkedin: entitlement.maxLinkedInAccounts },
      oauth: {
        configured: Boolean(oauth.clientId && oauth.clientSecret && process.env.TOKEN_ENCRYPTION_KEY),
        redirectUri: oauth.redirectUri,
        scopes: oauth.scopes,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load LinkedIn connection." }, { status: 401 });
  }
}

export async function POST(request) {
  try {
    const scope = await socialAccountScope(request);
    const entitlement = await workspaceEntitlements(prisma, scope.user.organizationId);
    const limit = Number(entitlement.maxLinkedInAccounts || 0);
    if (!limit) return NextResponse.json({ error: "LinkedIn publishing requires a paid plan." }, { status: 403 });
    try {
      assertCanManageSocialConnections(scope, "LinkedIn");
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const used = (await listWorkspaceDestinations(scope.where)).filter((item) => item.provider === "LINKEDIN").length;
    if (used >= limit) {
      return NextResponse.json({ error: `Your plan includes ${limit} LinkedIn account${limit === 1 ? "" : "s"}. Disconnect one before connecting another.` }, { status: 403 });
    }
    const oauth = settings(request);
    const missing = [!oauth.clientId && "LINKEDIN_CLIENT_ID", !oauth.clientSecret && "LINKEDIN_CLIENT_SECRET", !process.env.TOKEN_ENCRYPTION_KEY && "TOKEN_ENCRYPTION_KEY"].filter(Boolean);
    if (missing.length) return NextResponse.json({ error: `LinkedIn OAuth is not configured. Add ${missing.join(", ")}.`, redirectUri: oauth.redirectUri }, { status: 501 });
    const state = crypto.randomUUID();
    await prisma.socialConnection.create({
      data: { ...scope.data, provider: "LINKEDIN", status: "CONNECTING", connectedBy: scope.user.sub, scopes: JSON.stringify(oauth.scopes), metadata: JSON.stringify({ state }) },
    });
    const url = new URL(process.env.LINKEDIN_AUTHORIZATION_URL || AUTHORIZATION_URL);
    url.search = new URLSearchParams({ response_type: "code", client_id: oauth.clientId, redirect_uri: oauth.redirectUri, state, scope: oauth.scopes.join(" ") }).toString();
    return NextResponse.json({ authorizationUrl: url.toString() });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to start LinkedIn connection." }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    await disconnectSocialProvider(request, "LINKEDIN");
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to disconnect LinkedIn." }, { status: error.status || 403 });
  }
}