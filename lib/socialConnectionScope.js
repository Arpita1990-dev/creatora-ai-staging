import { hashToken, requireOrganization } from "./auth.js";
import { prisma } from "./prisma.js";
import { canManageOrganizationResources } from "./organizationPermissions.js";
import { destinationsBelongToWorkspace, parseMetadata } from "./socialDestinations.js";

export async function socialAccountScope(request) {
  const { user, membership } = await requireOrganization(request);
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, accountType: true, ownerId: true },
  });
  const isOrganization = organization?.accountType === "ORGANIZATION";
  return {
    user,
    membership,
    organization,
    isOrganization,
    where: isOrganization
      ? { organizationId: user.organizationId }
      : { userId: user.sub, organizationId: null },
    data: isOrganization
      ? { organizationId: user.organizationId }
      : { userId: user.sub, organizationId: null },
  };
}

// Credential management (connect / disconnect / replace) is Owner + Admin only.
// This is the same rule the MuAPI routes use, resolved from Organization.ownerId
// plus the active membership rather than duplicated role strings.
export function canManageSocialConnections(scope) {
  return canManageOrganizationResources({
    organization: scope.organization,
    membership: scope.membership,
    userId: scope.user.sub,
  });
}

export function assertCanManageSocialConnections(scope, providerName) {
  if (!canManageSocialConnections(scope)) {
    const error = new Error(
      scope.isOrganization
        ? `Only organization owners and admins can manage ${providerName} connections.`
        : `You cannot manage ${providerName} connections.`
    );
    error.status = 403;
    throw error;
  }
}

export function connectionWorkspaceFields(connection) {
  return { userId: connection.userId || null, organizationId: connection.organizationId || null };
}

export function connectionBelongsToWorkspace(connection, scope) {
  if (!connection) return false;
  if (scope.isOrganization) return Boolean(connection.organizationId) && connection.organizationId === scope.user.organizationId;
  return Boolean(connection.userId) && connection.userId === scope.user.sub && !connection.organizationId;
}

export async function callbackOrganization(request, providerName) {
  try {
    return await requireOrganization(request);
  } catch {
    const cookieName = process.env.AUTH_COOKIE_NAME || "creatora_refresh";
    const refreshToken = request.cookies.get(cookieName)?.value;
    if (!refreshToken) throw new Error(`Your login session expired. Sign in and connect ${providerName} again.`);
    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
      throw new Error(`Your login session expired. Sign in and connect ${providerName} again.`);
    }
    const membership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: session.organizationId, userId: session.userId } },
    });
    if (!membership || membership.status !== "ACTIVE") throw new Error("Workspace access is no longer available.");
    return { user: { sub: session.userId, organizationId: session.organizationId }, membership };
  }
}

export async function findPendingSocialConnection(provider, state, connectedBy) {
  const records = await prisma.socialConnection.findMany({
    where: { provider, status: "CONNECTING", ...(connectedBy ? { connectedBy } : {}) },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return records.find((record) => {
    try { return JSON.parse(record.metadata || "{}").state === state; }
    catch { return false; }
  });
}

export function socialDashboardUrl(request, provider, status, message) {
  const url = new URL("/dashboard/settings", new URL(request.url).origin);
  url.searchParams.set(provider.toLowerCase(), status);
  if (message) url.searchParams.set("message", String(message).slice(0, 300));
  return url;
}

export { parseMetadata };

// Legacy provider-wide disconnect. Kept so the existing per-provider DELETE
// handlers keep working; the UI disconnects single destinations instead.
export async function disconnectSocialProvider(request, provider) {
  const scope = await socialAccountScope(request);
  assertCanManageSocialConnections(scope, provider);
  await prisma.socialConnection.updateMany({
    where: { ...scope.where, provider },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      metadata: "{}",
    },
  });
  await prisma.socialDestination.deleteMany({ where: { ...scope.where, provider } });
  return scope;
}

function connectionIsEmpty(connectionId) {
  return prisma.socialDestination.count({ where: { socialConnectionId: connectionId } }).then((count) => count === 0);
}

async function retireConnectionIfUnused(connection) {
  if (!(await connectionIsEmpty(connection.id))) return false;
  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
    },
  });
  return true;
}

// Disconnects exactly one connected account. The stored authorization is only
// destroyed once its last destination is gone, so removing Facebook page B
// leaves Facebook page A publishing normally.
async function removeDestination(scope, destination) {
  if (!destinationsBelongToWorkspace(destination, scope)) {
    const error = new Error("This connection does not belong to the active workspace.");
    error.status = 403;
    throw error;
  }
  await prisma.socialDestination.delete({ where: { id: destination.id } });
  const connectionRetired = await retireConnectionIfUnused(destination.connection);
  return { scope, destination, connection: destination.connection, connectionRetired };
}

export async function disconnectSocialDestination(request, destinationId) {
  const scope = await socialAccountScope(request);
  assertCanManageSocialConnections(scope, "social");
  const destination = await prisma.socialDestination.findUnique({
    where: { id: destinationId },
    include: { connection: true },
  });
  if (!destination) {
    const error = new Error("That connected account no longer exists.");
    error.status = 404;
    throw error;
  }
  return removeDestination(scope, destination);
}

// Accepts either a destination id (preferred: one account) or a legacy
// connection id (the whole authorization).
export async function disconnectSocialTarget(request, targetId) {
  const scope = await socialAccountScope(request);
  assertCanManageSocialConnections(scope, "social");
  const destination = await prisma.socialDestination.findUnique({
    where: { id: targetId },
    include: { connection: true },
  });
  if (destination) return removeDestination(scope, destination);
  const connection = await prisma.socialConnection.findUnique({ where: { id: targetId } });
  if (!connection) {
    const error = new Error("That connected account no longer exists.");
    error.status = 404;
    throw error;
  }
  if (!connectionBelongsToWorkspace(connection, scope)) {
    const error = new Error("This connection does not belong to the active workspace.");
    error.status = 403;
    throw error;
  }
  await prisma.socialDestination.deleteMany({ where: { socialConnectionId: connection.id } });
  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
    },
  });
  return { scope, destination: null, connection, connectionRetired: true };
}

export async function listSocialConnections(request) {
  const scope = await socialAccountScope(request);
  const connections = await prisma.socialConnection.findMany({
    where: { ...scope.where, status: { not: "DISCONNECTED" } },
    orderBy: [{ provider: "asc" }, { updatedAt: "desc" }],
  });
  return { scope, connections };
}