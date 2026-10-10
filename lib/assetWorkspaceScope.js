export function assetWorkspaceWhere({ accountType, organizationId, userId }) {
  return accountType === "ORGANIZATION"
    ? { organizationId }
    : { userId, OR: [{ organizationId }, { organizationId: null }] };
}

export function generatedAssetLibraryWhere(scope) {
  return {
    ...assetWorkspaceWhere(scope),
    assetType: { in: ["IMAGE", "VIDEO"] },
    status: "COMPLETED",
    provider: { not: "LOCAL_REFERENCE" },
    outputUrl: { not: null },
    completedAt: { not: null },
  };
}

export function isGeneratedAssetLibraryItem(asset) {
  return asset?.generated !== false
    && asset?.status === "COMPLETED"
    && ["IMAGE", "VIDEO"].includes(String(asset?.assetType || "").toUpperCase())
    && Boolean(asset?.outputUrl && asset?.completedAt);
}
