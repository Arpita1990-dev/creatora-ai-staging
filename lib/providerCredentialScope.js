export function getProviderCredentialScope({ shared, organizationId, userId, provider = "MUAPI" }) {
  return {
    where: shared
      ? { provider_organizationId: { provider, organizationId } }
      : { provider_userId: { provider, userId } },
    create: shared ? { provider, organizationId } : { provider, userId },
  };
}
