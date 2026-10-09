import "server-only";
import { currentRefreshToken, hashToken } from "./auth.js";
import { prisma } from "./prisma.js";
import { resolveMuApiKey } from "./providerCredentials.js";

export async function getCurrentMuApiContext() {
  const token = await currentRefreshToken();
  if (!token) return null;
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE" || !session.organizationId) {
    return null;
  }
  try {
    return {
      apiKey: await resolveMuApiKey(prisma, session.organizationId, session.userId),
      user: session.user,
    };
  } catch {
    return null;
  }
}
