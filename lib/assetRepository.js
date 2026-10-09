import { prisma } from "./prisma";

function serializePlatforms(platform) {
  if (Array.isArray(platform)) return JSON.stringify(platform);
  if (!platform) return "[]";
  return JSON.stringify(
    String(platform)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function deserializeAsset(asset) {
  if (!asset) return null;
  let platforms = [];
  try {
    platforms = JSON.parse(asset.platforms || "[]");
  } catch {}
  return { ...asset, platforms };
}

export async function createAssetRecord(input) {
  const data = {
    id: input.assetId,
    userId: input.userId,
    organizationId: input.organizationId || input.workspaceId || null,
    projectId: input.projectId || null,
    campaignId: input.campaignId || null,
    title: input.title || input.name || "Untitled asset",
    assetType: ["IMAGE", "VIDEO", "AUDIO"].includes(
      String(input.type || input.assetType || "IMAGE").toUpperCase(),
    )
      ? String(input.type || input.assetType || "IMAGE").toUpperCase()
      : "IMAGE",
    status: normalizeStatus(input.status),
    prompt: input.prompt || null,
    platforms: serializePlatforms(input.platform || input.platforms),
    aspectRatio: input.format || input.aspectRatio || null,
    durationSeconds: input.duration ? Number(input.duration) : null,
    provider: input.provider || "MUAPI",
    providerJobId: input.providerJobId || null,
    providerStatus: input.providerStatus || null,
    outputUrl: input.outputUrl || input.url || null,
    thumbnailUrl: input.thumbnailUrl || null,
    errorMessage: input.errorMessage || null,
    estimatedCredits: Number(input.estimatedCredits || 0),
    chargedCredits: Number(input.chargedCredits || 0),
    startedAt: input.startedAt ? new Date(input.startedAt) : null,
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
    createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
  };
  const asset = await prisma.asset.upsert({
    where: { id: data.id },
    create: data,
    update: Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) =>
          key !== "id" && key !== "createdAt" && value !== undefined,
      ),
    ),
  });
  return deserializeAsset(asset);
}

export async function updateAssetRecord(id, updates) {
  const data = buildUpdateData(updates);
  const asset = await prisma.asset.update({ where: { id }, data });
  return deserializeAsset(asset);
}

export async function updateAssetRecordByProviderJobId(providerJobId, updates) {
  const data = buildUpdateData(updates);
  const asset = await prisma.asset.update({ where: { providerJobId }, data });
  return deserializeAsset(asset);
}

function buildUpdateData(updates) {
  const data = {};
  if (updates.status) data.status = normalizeStatus(updates.status);
  if ("providerJobId" in updates) data.providerJobId = updates.providerJobId;
  if ("providerStatus" in updates) data.providerStatus = updates.providerStatus;
  if ("outputUrl" in updates || "url" in updates)
    data.outputUrl = updates.outputUrl || updates.url || null;
  if ("thumbnailUrl" in updates) data.thumbnailUrl = updates.thumbnailUrl;
  if ("errorMessage" in updates) data.errorMessage = updates.errorMessage;
  if ("chargedCredits" in updates)
    data.chargedCredits = Number(updates.chargedCredits || 0);
  if ("startedAt" in updates)
    data.startedAt = updates.startedAt ? new Date(updates.startedAt) : null;
  if ("completedAt" in updates)
    data.completedAt = updates.completedAt
      ? new Date(updates.completedAt)
      : null;
  return data;
}

export async function findAssets({ userId, includeActive = true } = {}) {
  const assets = await prisma.asset.findMany({
    where: { userId, ...(includeActive ? {} : { status: "COMPLETED" }) },
    orderBy: { createdAt: "desc" },
  });
  return assets.map(deserializeAsset);
}

export async function findProcessingAssets() {
  const assets = await prisma.asset.findMany({
    where: {
      status: { in: ["QUEUED", "PROCESSING"] },
      providerJobId: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });
  return assets.map(deserializeAsset);
}

function normalizeStatus(status) {
  const value = String(status || "QUEUED").toUpperCase();
  return ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"].includes(value)
    ? value
    : "QUEUED";
}
