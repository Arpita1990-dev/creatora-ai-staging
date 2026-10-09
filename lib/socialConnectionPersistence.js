import { prisma } from "./prisma.js";

export async function persistSocialConnection(connection, providerAccountId, data) {
  const workspace = connection.organizationId
    ? { organizationId: connection.organizationId, userId: null }
    : { userId: connection.userId, organizationId: null };
  const accountId = String(providerAccountId);
  const existing = await prisma.socialConnection.findFirst({
    where: {
      ...workspace,
      provider: connection.provider,
      providerAccountId: accountId,
      id: { not: connection.id },
    },
  });
  // A fresh OAuth authorization for an identity that is already present in
  // this workspace is a reauthorization, not a second account. Reuse the
  // stable row so destination ids and publish history remain intact, while the
  // newly-issued credentials replace only that account's credentials.
  const target = existing || connection;
  const saved = await prisma.socialConnection.update({
    where: { id: target.id },
    data: { ...data, providerAccountId: accountId, status: "CONNECTED" },
  });
  if (existing) {
    await prisma.socialConnection.update({
      where: { id: connection.id },
      data: {
        status: "DISCONNECTED",
        providerAccountId: null,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
        metadata: "{}",
      },
    });
  }
  return saved;
}
