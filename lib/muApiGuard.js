import { prisma } from "./prisma";
import { getProviderCredentialScope } from "./providerCredentialScope.js";

/**
 * Check if MuAPI is connected for the given user/organization.
 * Returns { connected: boolean, scope: string }.
 */
export async function checkMuApiConnection(organizationId, userId) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { accountType: true },
  });
  const shared = organization?.accountType === "ORGANIZATION";
  const { where } = getProviderCredentialScope({ shared, organizationId, userId });
  const credential = await prisma.providerCredential.findUnique({ where });
  return { connected: Boolean(credential), scope: shared ? "ORGANIZATION" : "PERSONAL" };
}
