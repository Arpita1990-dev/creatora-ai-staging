export function assetWorkspaceWhere({ accountType, organizationId, userId }) {
  return accountType === "ORGANIZATION"
    ? { organizationId }
    : { userId, OR: [{ organizationId }, { organizationId: null }] };
}
