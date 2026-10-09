import { decryptToken } from "./tokenEncryption.js";

export async function resolveMuApiKey(prisma, organizationId, userId) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { accountType: true } });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (membership?.status !== "ACTIVE") throw new Error("NOT_ORGANIZATION_MEMBER");
  const where = organization?.accountType === "ORGANIZATION"
    ? { provider: "MUAPI", organizationId }
    : { provider: "MUAPI", userId, organizationId: null };
  const credential = await prisma.providerCredential.findFirst({ where, orderBy: { updatedAt: "desc" } });
  if (!credential?.secretEncrypted) throw new Error(organization.accountType === "ORGANIZATION" ? "MUAPI_NOT_CONNECTED_FOR_ORGANIZATION" : "MUAPI_NOT_CONNECTED");
  return decryptToken(credential.secretEncrypted);
}
