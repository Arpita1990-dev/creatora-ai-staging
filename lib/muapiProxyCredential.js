import "server-only";
import { requireOrganizationSession } from "./auth.js";
import { prisma } from "./prisma.js";
import { resolveMuApiKey } from "./providerCredentials.js";

export async function resolveRequestMuApiKey(request) {
  const { user } = await requireOrganizationSession(request);
  return resolveMuApiKey(prisma, user.organizationId, user.sub);
}

export function cleanMuApiProxyHeaders(request) {
  const headers = new Headers(request.headers);
  for (const name of ["host", "connection", "cookie", "authorization", "x-api-key"]) {
    headers.delete(name);
  }
  return headers;
}
