import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceEntitlements } from "@/lib/planCatalog";
import { canManageSocialConnections, socialAccountScope } from "@/lib/socialConnectionScope";
import { annotatePlanLimits, ensureDestinations, listWorkspaceDestinations } from "@/lib/socialDestinations";

// Read-only view of every connected publishing destination in the active
// workspace. Members may read this so they can publish, but it never contains a
// token — access and refresh tokens stay encrypted on SocialConnection.
export async function GET(request) {
  try {
    const scope = await socialAccountScope(request);
    const entitlement = await workspaceEntitlements(prisma, scope.user.organizationId);
    const connections = await prisma.socialConnection.findMany({
      where: { ...scope.where, status: "CONNECTED" },
      orderBy: { updatedAt: "desc" },
    });
    for (const connection of connections) await ensureDestinations(connection);
    const destinations = annotatePlanLimits(await listWorkspaceDestinations(scope.where), entitlement);
    const providers = [...new Set(connections.map((connection) => connection.provider))].map((provider) => ({
      provider,
      connectionCount: connections.filter((connection) => connection.provider === provider).length,
      accountCount: destinations.filter((destination) => destination.provider === provider).length,
    }));
    return NextResponse.json({
      scope: scope.isOrganization ? "ORGANIZATION" : "PERSONAL",
      canManage: canManageSocialConnections(scope),
      organization: scope.organization
        ? { id: scope.organization.id, name: null, accountType: scope.organization.accountType }
        : null,
      limits: {
        facebook: entitlement.maxFacebookAccounts,
        instagram: entitlement.maxInstagramAccounts,
        linkedin: entitlement.maxLinkedInAccounts,
        youtube: entitlement.maxYouTubeAccounts,
        plan: entitlement.code,
      },
      providers,
      destinations,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load social connections." }, { status: 401 });
  }
}