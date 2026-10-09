import 'server-only';

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { objectPathFromReference, removeObject } from './supabaseStorage.js';

const mediaFields = ['outputUrl', 'thumbnailUrl', 'finalVideoUrl', 'finalThumbnailUrl'];

async function removeStoredMedia(records) {
  const references = new Set(
    records.flatMap((record) => mediaFields.map((field) => record?.[field])).filter(Boolean),
  );
  const removals = [];
  for (const reference of references) {
    const objectPath = objectPathFromReference(reference);
    if (objectPath) removals.push(removeObject(objectPath));
  }
  await Promise.allSettled(removals);

  const legacyReferences = records.filter((record) => record?.provider === 'LOCAL_REFERENCE' && /^reference_[\da-f-]+$/i.test(record.id));
  await Promise.allSettled(legacyReferences.flatMap((record) =>
    ['.jpg', '.jpeg', '.png', '.webp'].map((extension) =>
      rm(resolve(process.cwd(), '.data', 'project-assets', `${record.id}${extension}`), { force: true }),
    ),
  ));
}

async function deleteDependentRecords(tx, { assetIds = [], projectIds = [], campaignIds = [] }) {
  const jobFilters = [];
  if (assetIds.length) jobFilters.push({ assetId: { in: assetIds } });
  if (projectIds.length) jobFilters.push({ projectId: { in: projectIds } });
  if (campaignIds.length) jobFilters.push({ campaignId: { in: campaignIds } });
  const jobs = jobFilters.length
    ? await tx.generationJob.findMany({ where: { OR: jobFilters }, select: { id: true } })
    : [];
  const jobIds = jobs.map((job) => job.id);

  const attemptFilters = [];
  if (jobIds.length) attemptFilters.push({ generationJobId: { in: jobIds } });
  if (projectIds.length) attemptFilters.push({ projectId: { in: projectIds } });
  if (campaignIds.length) attemptFilters.push({ campaignId: { in: campaignIds } });
  if (attemptFilters.length) await tx.providerAttempt.deleteMany({ where: { OR: attemptFilters } });
  if (jobIds.length) await tx.generationJob.deleteMany({ where: { id: { in: jobIds } } });
  if (assetIds.length) {
    await tx.publishJob.deleteMany({ where: { assetId: { in: assetIds } } });
    await tx.asset.deleteMany({ where: { id: { in: assetIds } } });
  }
}

async function clearDeletedAssetPreviews(tx, assets) {
  const outputUrls = [...new Set(assets.map((asset) => asset.outputUrl).filter(Boolean))];
  const thumbnailUrls = [...new Set(assets.map((asset) => asset.thumbnailUrl).filter(Boolean))];
  if (outputUrls.length) {
    await tx.project.updateMany({ where: { finalVideoUrl: { in: outputUrls } }, data: { finalVideoUrl: null, successfulProvider: null, successfulProviderTaskId: null } });
  }
  if (thumbnailUrls.length) {
    await tx.project.updateMany({ where: { thumbnailUrl: { in: thumbnailUrls } }, data: { thumbnailUrl: null } });
    await tx.project.updateMany({ where: { finalThumbnailUrl: { in: thumbnailUrls } }, data: { finalThumbnailUrl: null } });
  }
}

export async function permanentlyDeleteAssets(database, assets) {
  const assetIds = assets.map((asset) => asset.id);
  if (!assetIds.length) return 0;
  await database.$transaction(async (tx) => {
    await clearDeletedAssetPreviews(tx, assets);
    await deleteDependentRecords(tx, { assetIds });
  });
  await removeStoredMedia(assets);
  return assetIds.length;
}

export async function permanentlyDeleteProjects(database, projects) {
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) return 0;
  const deletedMedia = await database.$transaction(async (tx) => {
    const campaigns = await tx.campaign.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    const campaignIds = campaigns.map((campaign) => campaign.id);
    const assetFilters = [{ projectId: { in: projectIds } }];
    if (campaignIds.length) assetFilters.push({ campaignId: { in: campaignIds } });
    const assets = await tx.asset.findMany({ where: { OR: assetFilters } });
    await deleteDependentRecords(tx, { assetIds: assets.map((asset) => asset.id), projectIds, campaignIds });
    if (campaignIds.length) await tx.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    return assets;
  });
  await removeStoredMedia([...deletedMedia, ...projects]);
  return projectIds.length;
}
