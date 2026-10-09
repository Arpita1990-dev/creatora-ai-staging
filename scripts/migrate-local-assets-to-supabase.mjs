import "./migrate-local-assets-to-supabase-runner.mjs";
/*
import envPackage from "@next/env";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/postgres-client/index.js";
import {
  createObjectSignedUrl,
  downloadObject,
  getObjectPath,
  objectExists,
  objectPathFromReference,
  storageReference,
  uploadObject,
  verifyPrivateBucketAccess,
} from "../lib/supabaseStorage.js";

const { loadEnvConfig } = envPackage;
loadEnvConfig(process.cwd(), false);

const roots = [
  { name: "uploads", directory: "uploads" },
  { name: "project-assets", directory: path.join(".data", "project-assets") },
  { name: "voice-inputs", directory: path.join(".data", "voice-inputs") },
];
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const videoExtensions = new Set([".mp4", ".mov", ".webm"]);
const audioExtensions = new Set([".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"]);
const contentTypes = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg",
  ".aac": "audio/aac", ".flac": "audio/flac",
};

function increment(counts, key, amount = 1) {
  counts[key] = (counts[key] || 0) + amount;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function classifyUrl(value) {
  if (!value) return "EMPTY";
  if (value.startsWith("supabase://")) return "SUPABASE_OBJECT";
  if (value.startsWith("local-object://")) return "LOCAL_OBJECT";
  if (value.startsWith("/uploads/")) return "LOCAL_UPLOAD";
  if (value.startsWith("/api/project-assets/")) return "LOCAL_PROJECT_ASSET";
  if (/^https?:\/\//i.test(value)) return "REMOTE_EXTERNAL";
  return "OTHER";
}

function extensionCategory(extension) {
  if (imageExtensions.has(extension)) return "images";
  if (videoExtensions.has(extension)) return "videos";
  if (audioExtensions.has(extension)) return "audio";
  return null;
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

async function enumerateFiles() {
  const files = new Map();
  async function walk(root, directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(root, absolute);
      } else if (entry.isFile()) {
        const info = await stat(absolute);
        const relative = normalizeRelative(path.relative(process.cwd(), absolute));
        files.set(relative, { absolute, relative, root: root.name, size: info.size, mtime: info.mtime, extension: path.extname(entry.name).toLowerCase() });
      }
    }
  }
  for (const root of roots) await walk(root, path.resolve(root.directory));
  return files;
}

function projectAssetSource(id, fileIndex) {
  for (const extension of imageExtensions) {
    const relative = `.data/project-assets/${id}${extension}`;
    if (fileIndex.has(relative)) return relative;
  }
  return null;
}

function resolveLocalReference(value, fileIndex) {
  if (typeof value !== "string" || !value) return { kind: "none" };
  if (value.startsWith("supabase://")) return { kind: "migrated", objectPath: objectPathFromReference(value) };
  if (value.startsWith("local-object://voice-inputs/")) {
    const relative = `.data/voice-inputs/${value.slice("local-object://voice-inputs/".length)}`;
    return fileIndex.has(relative) ? { kind: "local", relative } : { kind: "missing", relative };
  }
  if (value.startsWith("/uploads/")) {
    let key;
    try { key = decodeURIComponent(value.slice("/uploads/".length).split(/[?#]/, 1)[0]); } catch { return { kind: "unresolved" }; }
    const relative = normalizeRelative(path.join("uploads", key));
    if (!relative.startsWith("uploads/") || relative.includes("../")) return { kind: "unresolved" };
    return fileIndex.has(relative) ? { kind: "local", relative } : { kind: "missing", relative };
  }
  if (value.startsWith("/api/project-assets/")) {
    const id = value.slice("/api/project-assets/".length).split(/[?#]/, 1)[0];
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return { kind: "unresolved" };
    const relative = projectAssetSource(id, fileIndex);
    return relative ? { kind: "local", relative } : { kind: "missing", relative: `.data/project-assets/${id}` };
  }
  if (/^https?:\/\//i.test(value)) return { kind: "remote" };
  return { kind: "none" };
}

function sourceFromLocalPath(value, fileIndex) {
  if (!value) return { kind: "none" };
  const absolute = path.resolve(String(value));
  const relative = normalizeRelative(path.relative(process.cwd(), absolute));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return { kind: "unresolved" };
  return fileIndex.has(relative) ? { kind: "local", relative } : { kind: "missing", relative };
}

function safeWorkspaceId(record, organizations, personalByUser) {
  if (record.organizationId) return organizations.has(record.organizationId) ? record.organizationId : null;
  if (!record.userId) return null;
  const matches = personalByUser.get(record.userId) || [];
  return matches.length === 1 ? matches[0] : null;
}

function makeStoragePlan({ fileIndex, references, forcedUnresolved, brandKitAssetIds }) {
  const workItems = new Map();
  const migratedObjects = new Set();
  const missing = new Set();
  let unresolvedOwnership = 0;
  let unresolvedReferences = 0;
  for (const reference of references) {
    const source = reference.source;
    if (source.kind === "remote") continue;
    if (source.kind === "migrated") {
      if (!reference.workspaceId || !source.objectPath.startsWith(`workspaces/${reference.workspaceId}/`)) {
        unresolvedReferences += 1;
      } else {
        migratedObjects.add(source.objectPath);
      }
      continue;
    }
    if (source.kind === "none") continue;
    if (source.kind === "missing") {
      missing.add(source.relative || `${reference.target.model}:${reference.target.id}`);
      continue;
    }
    if (source.kind !== "local") {
      unresolvedReferences += 1;
      continue;
    }
    const file = fileIndex.get(source.relative);
    if (!file) {
      missing.add(source.relative);
      continue;
    }
    if (!reference.workspaceId) {
      unresolvedOwnership += 1;
      forcedUnresolved.add(source.relative);
      continue;
    }
    let category = reference.category;
    if (!category && file.root === "project-assets") {
      const id = path.basename(source.relative, file.extension);
      category = brandKitAssetIds.has(id) ? "brand-kit" : "references";
    }
    if (!category && file.root === "voice-inputs") category = "voice-inputs";
    if (!category && file.root === "uploads") {
      const key = source.relative.slice("uploads/".length);
      category = key.startsWith("references/") ? "references" : extensionCategory(file.extension);
    }
    if (!category) {
      unresolvedReferences += 1;
      forcedUnresolved.add(source.relative);
      continue;
    }
    const projectId = reference.projectId || null;
    const key = `${reference.workspaceId}\0${source.relative}`;
    let item = workItems.get(key);
    if (!item) {
      const stableId = `m-${sha256(`${reference.workspaceId}\0${source.relative}`).slice(0, 32)}`;
      const objectPath = getObjectPath({
        workspaceId: reference.workspaceId,
        projectId,
        resourceId: reference.resourceId || reference.target.id,
        category,
        extension: file.extension,
        objectId: stableId,
      });
      item = { source: file, workspaceId: reference.workspaceId, projectId, category, objectPath, references: [] };
      workItems.set(key, item);
    } else if (item.category !== category) {
      unresolvedReferences += 1;
      forcedUnresolved.add(source.relative);
      continue;
    }
    item.references.push(reference.target);
  }
  return { workItems, migratedObjects, missing, unresolvedOwnership, unresolvedReferences };
}

function updateRecordMap(workItems, sourceRows) {
  const sourceByModel = new Map(sourceRows.map(({ model, rows }) => [model, new Map(rows.map((row) => [row.id, row]))]));
  const updates = new Map();
  for (const item of workItems.values()) {
    const reference = storageReference(item.objectPath);
    for (const target of item.references) {
      const key = `${target.model}:${target.id}`;
      let update = updates.get(key);
      if (!update) {
        update = { model: target.model, id: target.id, data: {}, source: sourceByModel.get(target.model)?.get(target.id) };
        updates.set(key, update);
      }
      if (target.model === "GenerationJob") {
        const field = target.field.startsWith("requestPayload.") ? "requestPayload" : "responsePayload";
        const value = JSON.parse(update.data[field] ?? update.source?.[field] ?? "{}");
        if (target.field === "requestPayload.referenceStorage") {
          value.referenceStorage = { provider: "supabase", key: reference, storageUrl: reference };
        } else {
          const property = target.field.slice(`${field}.`.length);
          value[property] = reference;
        }
        update.data[field] = JSON.stringify(value);
      } else {
        update.data[target.field] = reference;
      }
    }
  }
  return updates;
}

async function executePlan(prisma, workItems, updates, privateBucket) {
  if (!privateBucket) throw new Error("Execution requires a verified private bucket.");
  for (const item of workItems.values()) {
    const bytes = await readFile(item.source.absolute);
    const checksum = sha256(bytes);
    if (await objectExists(item.objectPath)) {
      const existing = await downloadObject(item.objectPath);
      if (sha256(existing) !== checksum) throw new Error("An existing storage object failed checksum verification.");
      item.alreadyMigrated = true;
    } else {
      await uploadObject(item.objectPath, bytes, { contentType: contentTypes[item.source.extension] || "application/octet-stream", upsert: false });
      if (!(await objectExists(item.objectPath))) throw new Error("Uploaded object was not visible during verification.");
      const uploaded = await downloadObject(item.objectPath);
      if (sha256(uploaded) !== checksum) throw new Error("Uploaded object failed checksum verification.");
      item.alreadyMigrated = false;
    }
  }
  await prisma.$transaction(async (tx) => {
    for (const update of updates.values()) {
      const delegate = tx[update.model[0].toLowerCase() + update.model.slice(1)];
      await delegate.update({ where: { id: update.id }, data: update.data });
    }
  });
  const reportPath = path.resolve("backups", `supabase-storage-migration-${Date.now()}-${randomUUID()}.json`);
  const report = { completedAt: new Date().toISOString(), objects: workItems.size, recordsUpdated: updates.size };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return report;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const configurationReady = Boolean(
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY) &&
    process.env.STORAGE_BUCKET,
  );
  console.log(`STORAGE_CONFIGURATION: ${configurationReady ? "PASS" : "FAIL"}`);
  const prisma = new PrismaClient({ log: [] });
  try {
    const fileIndex = await enumerateFiles();
    const [organizations, members, assets, projects, voiceInputs, voiceVideoJobs, generationJobs, brandKits] = await Promise.all([
      prisma.organization.findMany({ select: { id: true, accountType: true, ownerId: true } }),
      prisma.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { organizationId: true, userId: true, organization: { select: { accountType: true } } } }),
      prisma.asset.findMany({ select: { id: true, userId: true, organizationId: true, projectId: true, campaignId: true, assetType: true, status: true, outputUrl: true, thumbnailUrl: true } }),
      prisma.project.findMany({ select: { id: true, organizationId: true, thumbnailUrl: true, finalVideoUrl: true, finalThumbnailUrl: true } }),
      prisma.voiceInput.findMany({ select: { id: true, userId: true, organizationId: true, storageUrl: true } }),
      prisma.voiceVideoJob.findMany({ select: { id: true, userId: true, organizationId: true, campaignId: true, outputUrl: true, thumbnailUrl: true } }),
      prisma.generationJob.findMany({ select: { id: true, userId: true, organizationId: true, projectId: true, type: true, status: true, completedAt: true, requestPayload: true, responsePayload: true } }),
      prisma.brandKit.findMany({ select: { organizationId: true, defaultLogoAssetId: true, secondaryLogoAssetId: true } }),
    ]);
    const organizationMap = new Map(organizations.map((item) => [item.id, item]));
    const personalByUser = new Map();
    for (const membership of members) if (membership.organization.accountType === "PERSONAL") {
      const entries = personalByUser.get(membership.userId) || [];
      entries.push(membership.organizationId);
      personalByUser.set(membership.userId, entries);
    }
    const brandKitAssetIds = new Set(brandKits.flatMap((kit) => [kit.defaultLogoAssetId, kit.secondaryLogoAssetId]).filter(Boolean));
    const references = [];
    const forcedUnresolved = new Set();
    let remoteExternal = 0;
    const addReference = (value, record, target, options = {}) => {
      const source = options.localPath
        ? sourceFromLocalPath(options.localPath, fileIndex)
        : resolveLocalReference(value, fileIndex);
      if (source.kind === "remote") remoteExternal += 1;
      references.push({ source, target, category: options.category, projectId: options.projectId, resourceId: options.resourceId, workspaceId: record ? safeWorkspaceId(record, organizationMap, personalByUser) : null });
    };

    for (const asset of assets) {
      const workspaceId = safeWorkspaceId(asset, organizationMap, personalByUser);
      const category = brandKitAssetIds.has(asset.id) ? "brand-kit" : null;
      addReference(asset.outputUrl, { ...asset, organizationId: workspaceId }, { model: "Asset", id: asset.id, field: "outputUrl" }, { category, projectId: asset.projectId, resourceId: asset.id });
      addReference(asset.thumbnailUrl, { ...asset, organizationId: workspaceId }, { model: "Asset", id: asset.id, field: "thumbnailUrl" }, { category, projectId: asset.projectId, resourceId: asset.id });
    }
    for (const project of projects) for (const field of ["thumbnailUrl", "finalVideoUrl", "finalThumbnailUrl"]) {
      addReference(project[field], project, { model: "Project", id: project.id, field }, { projectId: project.id, resourceId: project.id });
    }
    for (const voice of voiceInputs) addReference(voice.storageUrl, voice, { model: "VoiceInput", id: voice.id, field: "storageUrl" }, { category: "voice-inputs", resourceId: voice.id });
    for (const job of voiceVideoJobs) for (const field of ["outputUrl", "thumbnailUrl"]) {
      addReference(job[field], job, { model: "VoiceVideoJob", id: job.id, field }, { resourceId: job.id });
    }
    for (const job of generationJobs) {
      let request = {}, response = {};
      try { request = JSON.parse(job.requestPayload || "{}"); } catch { forcedUnresolved.add(`GenerationJob:${job.id}:requestPayload`); }
      try { response = JSON.parse(job.responsePayload || "{}"); } catch { forcedUnresolved.add(`GenerationJob:${job.id}:responsePayload`); }
      if (/^https?:\/\//i.test(request.referenceUrl || "")) remoteExternal += 1;
      if (/^https?:\/\//i.test(response.providerSourceUrl || "")) remoteExternal += 1;
      if (request.referenceStorage?.key || request.referenceStorage?.localPath) {
        addReference(null, job, { model: "GenerationJob", id: job.id, field: "requestPayload.referenceStorage" }, {
          category: "references", projectId: job.projectId, resourceId: job.id, localPath: request.referenceStorage.localPath || path.resolve("uploads", request.referenceStorage.key || ""),
        });
      }
      for (const field of ["url", "thumbnailUrl"]) {
        addReference(response[field], job, { model: "GenerationJob", id: job.id, field: `responsePayload.${field}` }, { projectId: job.projectId, resourceId: job.id });
      }
    }

    const { workItems, missing, unresolvedOwnership, unresolvedReferences } = makeStoragePlan({ fileIndex, references, forcedUnresolved, brandKitAssetIds });
    const updates = updateRecordMap(workItems, [
      { model: "Asset", rows: assets }, { model: "Project", rows: projects }, { model: "VoiceInput", rows: voiceInputs },
      { model: "VoiceVideoJob", rows: voiceVideoJobs }, { model: "GenerationJob", rows: generationJobs },
    ]);
    const referencedFiles = new Set([...workItems.values()].map((item) => item.source.relative));
    const temporaryProjectFiles = new Set();
    const legacyProjectFiles = new Set();
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const completedVideoJobs = new Map();
    const failedVideoJobs = new Map();
    for (const job of generationJobs) {
      if (job.type !== "VIDEO" || !job.projectId) continue;
      const index = job.status === "COMPLETED" ? completedVideoJobs : job.status === "FAILED" ? failedVideoJobs : null;
      if (!index) continue;
      const items = index.get(job.projectId) || [];
      items.push(job);
      index.set(job.projectId, items);
    }
    for (const file of fileIndex.values()) {
      if (file.root !== "uploads" || !file.relative.startsWith("uploads/projects/") || file.extension !== ".mp4" || referencedFiles.has(file.relative)) continue;
      const projectId = file.relative.split("/")[2];
      const project = projectsById.get(projectId);
      if (!project) continue;
      const finalAssetExists = assets.some((asset) => asset.projectId === projectId && asset.assetType === "VIDEO" && asset.status === "COMPLETED" && resolveLocalReference(asset.outputUrl, fileIndex).kind === "local");
      const projectFinalExists = resolveLocalReference(project.finalVideoUrl, fileIndex).kind === "local";
      const completedJobBeforeFile = (completedVideoJobs.get(projectId) || []).some((job) => job.completedAt && file.mtime <= new Date(job.completedAt));
      if (finalAssetExists && projectFinalExists && completedJobBeforeFile) {
        temporaryProjectFiles.add(file.relative);
        continue;
      }
        function originalReference(target, sourceByModel) {
          const row = sourceByModel.get(target.model)?.get(target.id);
          if (!row) return null;
          if (target.model !== "GenerationJob") return row[target.field] ?? null;
          const [field, property] = target.field.split(".");
          try {
            const payload = JSON.parse(row[field] || "{}");
            if (target.field === "requestPayload.referenceStorage") {
              return payload.referenceStorage?.storageUrl || payload.referenceStorage?.key || payload.referenceStorage?.localPath || null;
            }
            return payload[property] ?? null;
          } catch {
            return null;
          }
        }

        async function readMigrationManifest() {
          const manifestPath = path.resolve("backups", "supabase-storage-migration-manifest.json");
          try {
            return { manifestPath, manifest: JSON.parse(await readFile(manifestPath, "utf8")) };
          } catch (error) {
            if (error.code === "ENOENT") return { manifestPath, manifest: null };
            throw new Error("Existing storage migration manifest could not be read.");
          }
        }

        async function writeMigrationManifest(manifestPath, manifest) {
          manifest.updatedAt = new Date().toISOString();
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        }

        async function executePlan(prisma, workItems, sourceRows, privateBucket) {
      if (failedAssetExists && (failedVideoJobs.get(projectId) || []).length && !project.finalVideoUrl) legacyProjectFiles.add(file.relative);
          const { manifestPath } = await readMigrationManifest();
          const sourceByModel = new Map(sourceRows.map(({ model, rows }) => [model, new Map(rows.map((row) => [row.id, row]))]));
          const items = [...workItems.values()];
          const entries = [];
          for (const item of items) {
            const bytes = await readFile(item.source.absolute);
            entries.push({
              sourceLocalPath: item.source.relative,
              workspaceId: item.workspaceId,
              projectId: item.projectId,
              category: item.category,
              objectPath: item.objectPath,
              sizeBytes: bytes.length,
              sha256: sha256(bytes),
              status: "PLANNED",
              references: item.references.map((target) => ({
                model: target.model,
                recordId: target.id,
                field: target.field,
                originalDatabaseReference: originalReference(target, sourceByModel),
              })),
            });
      else classification = "UNRESOLVED";
          const manifest = {
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: "UPLOADING",
            plannedObjects: entries.length,
            plannedBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
            entries,
          };
          await writeMigrationManifest(manifestPath, manifest);

          const verifiedItems = new Map();
          let systemicFailure = false;
          for (const [index, item] of items.entries()) {
            const entry = entries[index];
            try {
              const bytes = await readFile(item.source.absolute);
              if (bytes.length !== entry.sizeBytes || sha256(bytes) !== entry.sha256) {
                throw new Error("Source file changed after manifest creation.");
              }
              if (await objectExists(item.objectPath)) {
                const existing = await downloadObject(item.objectPath);
                if (existing.length !== entry.sizeBytes || sha256(existing) !== entry.sha256) {
                  throw new Error("Existing object failed checksum verification.");
                }
                entry.status = "ALREADY_VERIFIED";
              } else {
                await uploadObject(item.objectPath, bytes, { contentType: contentTypes[item.source.extension] || "application/octet-stream", upsert: false });
                if (!(await objectExists(item.objectPath))) throw new Error("Uploaded object was not visible during verification.");
                const uploaded = await downloadObject(item.objectPath);
                if (uploaded.length !== entry.sizeBytes || sha256(uploaded) !== entry.sha256) {
                  throw new Error("Uploaded object failed size or checksum verification.");
                }
                entry.status = "VERIFIED";
              }
              verifiedItems.set(`${item.workspaceId}\0${item.source.relative}`, item);
            } catch (error) {
              entry.status = "FAILED";
              entry.failure = {
                error: String(error?.name || "Error").replace(/[^A-Za-z0-9_.-]/g, ""),
                statusCode: Number(error?.statusCode) || null,
              };
              if ([401, 403, 404].includes(entry.failure.statusCode) || entry.failure.statusCode >= 500) systemicFailure = true;
            }
            await writeMigrationManifest(manifestPath, manifest);
            if (systemicFailure) break;
          }

          const verifiedEntries = entries.filter((entry) => ["VERIFIED", "ALREADY_VERIFIED"].includes(entry.status));
          const failedEntries = entries.filter((entry) => entry.status === "FAILED");
          if (systemicFailure) {
            manifest.status = "STOPPED_SYSTEMIC_STORAGE_FAILURE";
            await writeMigrationManifest(manifestPath, manifest);
            return { manifestPath, entries, recordsUpdated: 0, failed: failedEntries.length, uploadedButNotUpdated: verifiedEntries.length };
          }

          const successfulWorkItems = new Map([...verifiedItems.entries()]);
          const updates = updateRecordMap(successfulWorkItems, sourceRows);
          try {
            await prisma.$transaction(async (tx) => {
              for (const update of updates.values()) {
                const delegate = tx[update.model[0].toLowerCase() + update.model.slice(1)];
                await delegate.update({ where: { id: update.id }, data: update.data });
              }
            });
          } catch {
            for (const entry of verifiedEntries) entry.status = "UPLOADED_BUT_DB_UPDATE_FAILED";
            manifest.status = "DATABASE_UPDATE_FAILED";
            await writeMigrationManifest(manifestPath, manifest);
            return { manifestPath, entries, recordsUpdated: 0, failed: failedEntries.length, uploadedButNotUpdated: verifiedEntries.length };
          }

          for (const entry of verifiedEntries) entry.status = "DB_UPDATED";
          manifest.status = failedEntries.length ? "PARTIAL" : "COMPLETE";
          manifest.recordsUpdated = updates.size;
          await writeMigrationManifest(manifestPath, manifest);
          for (const entry of verifiedEntries) {
            const item = entries.find((candidate) => candidate === entry);
            for (const reference of item.references) {
              const update = updates.get(`${reference.model}:${reference.recordId}`);
              if (!update) continue;
              const stored = await prisma[reference.model[0].toLowerCase() + reference.model.slice(1)].findUnique({ where: { id: reference.recordId } });
              if (!stored) throw new Error("Updated record could not be read back.");
            }
      }
          return { manifestPath, entries, recordsUpdated: updates.size, failed: failedEntries.length, uploadedButNotUpdated: 0 };
      try {
        await verifyPrivateBucketAccess();
        privateBucket = true;
      } catch (error) {
        console.log(`PRIVATE_BUCKET_ACCESS: FAIL${error.statusCode ? ` (HTTP ${error.statusCode})` : ""}`);
      }
    } else {
      console.log("PRIVATE_BUCKET_ACCESS: FAIL (configuration missing)");
    }
    const existingObjectPaths = new Set();
    if (privateBucket) {
      for (const item of workItems.values()) if (await objectExists(item.objectPath)) existingObjectPaths.add(item.objectPath);
    }
    const alreadyMigrated = existingObjectPaths.size;
    const estimatedBytes = [...workItems.values()].reduce((sum, item) => sum + item.source.size, 0);
    const unresolvedCount = fileClasses.UNRESOLVED + unresolvedReferences + unresolvedOwnership;
    const missingCount = missing.size;
    const storageReady = configurationReady && privateBucket;
    const dryRunPassed = storageReady && missingCount === 0 && unresolvedCount === 0;

    console.log(`WORKSPACE_PATH_SCOPING: ${[...workItems.values()].every((item) => item.objectPath.startsWith(`workspaces/${item.workspaceId}/`)) ? "PASS" : "FAIL"}`);
    console.log("STORAGE_ADAPTER: PASS");
    console.log(`WORKSPACE_PATH_SCOPING: ${[...workItems.values()].every((item) => item.objectPath.startsWith(`workspaces/${item.workspaceId}/`)) ? "PASS" : "FAIL"}`);
    console.log(`DRY_RUN: ${dryRunPassed ? "PASS" : "FAIL"}`);
    console.log("SCHEMA_CHANGE_REQUIRED: NO");
    console.log(`TOTAL_LOCAL_FILES: ${fileIndex.size}`);
    console.log(`PERSISTENT_ASSETS: ${fileClasses.PERSISTENT_USER_ASSET}`);
    console.log(`TEMPORARY_FILES: ${fileClasses.TEMPORARY_PROCESSING}`);
    console.log(`STATIC_FILES: ${fileClasses.STATIC_APPLICATION_ASSET}`);
    console.log(`LEGACY_UNUSED: ${fileClasses.LEGACY_OR_UNUSED}`);
    console.log(`REMOTE_EXTERNAL: ${remoteExternal}`);
    console.log(`UNRESOLVED: ${unresolvedCount}`);
    console.log(`UNRESOLVED_PROJECT_FILES: ${[...fileIndex.values()].filter((file) => file.root === "uploads" && file.relative.startsWith("uploads/projects/") && fileClasses.UNRESOLVED && !temporaryProjectFiles.has(file.relative) && !legacyProjectFiles.has(file.relative) && !referencedFiles.has(file.relative)).length}`);
    console.log(`PROJECT_FILES_TEMPORARY_PROCESSING: ${temporaryProjectFiles.size}`);
    console.log(`PROJECT_FILES_LEGACY_OR_UNUSED: ${legacyProjectFiles.size}`);
    console.log(`MISSING_REFERENCED_FILES: ${missingCount}`);
    console.log(`ASSET_RECORDS_TO_UPDATE: ${new Set([...updates.values()].filter((item) => item.model === "Asset").map((item) => item.id)).size}`);
    console.log(`PROJECT_RECORDS_TO_UPDATE: ${new Set([...updates.values()].filter((item) => item.model === "Project").map((item) => item.id)).size}`);
    console.log(`VOICE_INPUT_RECORDS_TO_UPDATE: ${new Set([...updates.values()].filter((item) => item.model === "VoiceInput").map((item) => item.id)).size}`);
    console.log(`GENERATION_JOB_PAYLOADS_TO_UPDATE: ${new Set([...updates.values()].filter((item) => item.model === "GenerationJob").map((item) => item.id)).size}`);
    console.log(`BRAND_KIT_REFERENCES: ${brandKitAssetIds.size}`);
    console.log(`FILES_TO_UPLOAD: ${Math.max(0, workItems.size - alreadyMigrated)}`);
    console.log(`ESTIMATED_UPLOAD_BYTES: ${[...workItems.values()].filter((item, index) => index >= alreadyMigrated).reduce((sum, item) => sum + item.source.size, 0)}`);
    console.log(`ALREADY_MIGRATED: ${alreadyMigrated}`);
    console.log(`UNRESOLVED_WORKSPACE_OWNERSHIP: ${unresolvedOwnership}`);
    for (const [folder, count] of Object.entries(unresolvedByFolder)) console.log(`UNRESOLVED_FOLDER ${folder}: ${count}`);
    for (const category of ["images", "videos", "audio", "references", "brand-kit", "voice-inputs"]) {
      const items = [...workItems.values()].filter((item) => item.category === category && !existingObjectPaths.has(item.objectPath));
      console.log(`FILES_TO_UPLOAD_${category.toUpperCase().replaceAll("-", "_")}: ${items.length}`);
      console.log(`BYTES_TO_UPLOAD_${category.toUpperCase().replaceAll("-", "_")}: ${items.reduce((sum, item) => sum + item.source.size, 0)}`);
    }
    console.log("DATABASE_RECORDS_MODIFIED: NO");
    console.log("STORAGE_OBJECTS_UPLOADED: 0");
    console.log("LOCAL_FILES_DELETED: 0");

    if (execute) {
      if (!process.argv.includes("--confirm-upload-migration")) throw new Error("Execution requires --confirm-upload-migration.");
      if (!dryRunPassed) throw new Error("Execution is blocked until the dry run passes and private bucket access is verified.");
        console.log(`ESTIMATED_UPLOAD_BYTES: ${[...workItems.values()].filter((item) => !existingObjectPaths.has(item.objectPath)).reduce((sum, item) => sum + item.source.size, 0)}`);
      const result = await executePlan(prisma, workItems, updates, privateBucket);
      console.log(`MIGRATION_EXECUTED: ${result.objects} objects; ${result.recordsUpdated} records updated.`);
    }
    if (!dryRunPassed) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const status = Number(error?.statusCode) || "unknown";
  console.error(`STORAGE_DRY_RUN: FAIL; error=${String(error?.name || "Error").replace(/[^A-Za-z0-9_.-]/g, "")}; status=${status}`);
  process.exitCode = 2;
});
*/
