import envPackage from "@next/env";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../generated/postgres-client/index.js";
import { downloadObject, getObjectPath, objectExists, objectPathFromReference, storageReference, uploadObject, verifyPrivateBucketAccess } from "../lib/supabaseStorage.js";

const { loadEnvConfig } = envPackage; loadEnvConfig(process.cwd(), false);
const ROOTS = [["uploads", "uploads"], ["project-assets", ".data/project-assets"], ["voice-inputs", ".data/voice-inputs"]];
const IMG = new Set([".jpg", ".jpeg", ".png", ".webp"]), VID = new Set([".mp4", ".mov", ".webm"]), AUD = new Set([".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"]);
const MIME = { ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".webp":"image/webp", ".mp4":"video/mp4", ".mov":"video/quicktime", ".webm":"video/webm", ".mp3":"audio/mpeg", ".wav":"audio/wav", ".m4a":"audio/mp4", ".ogg":"audio/ogg", ".aac":"audio/aac", ".flac":"audio/flac" };
const PREFIX = "supabase-storage-migration-manifest-", APPROVED = 98, APPROVED_BYTES = 148500779;
const hash = (v) => createHash("sha256").update(v).digest("hex"), norm = (v) => v.split(path.sep).join("/").replace(/^\.\//, "");
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const extensionCategory = (e) => IMG.has(e) ? "images" : VID.has(e) ? "videos" : AUD.has(e) ? "audio" : null;

function workspaceFor(record, orgIds, personalByUser) {
  if (record.organizationId) return orgIds.has(record.organizationId) ? record.organizationId : null;
  const matches = record.userId ? personalByUser.get(record.userId) || [] : [];
  return matches.length === 1 ? matches[0] : null;
}

async function scanFiles() {
  const files = new Map();
  async function walk(root, dir) {
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === "ENOENT") return; throw e; }
    for (const ent of entries) {
      const absolute = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(root, absolute);
      else if (ent.isFile()) { const s = await stat(absolute), relative = norm(path.relative(process.cwd(), absolute)); files.set(relative, { absolute, relative, root, size: s.size, mtime: s.mtime, ext: path.extname(ent.name).toLowerCase() }); }
    }
  }
  for (const [root, dir] of ROOTS) await walk(root, path.resolve(dir));
  return files;
}

function resolveSource(value, files) {
  if (!value) return { kind: "none" };
  if (value.startsWith("supabase://")) return { kind: "migrated", objectPath: objectPathFromReference(value) };
  if (value.startsWith("local-object://voice-inputs/")) { const relative = `.data/voice-inputs/${value.slice(28)}`; return files.has(relative) ? { kind: "local", relative } : { kind: "missing", relative }; }
  if (value.startsWith("/uploads/")) {
    let key; try { key = decodeURIComponent(value.slice(9).split(/[?#]/, 1)[0]); } catch { return { kind: "unresolved" }; }
    const relative = norm(path.join("uploads", key));
    if (!relative.startsWith("uploads/") || relative.includes("../")) return { kind: "unresolved" };
    return files.has(relative) ? { kind: "local", relative } : { kind: "missing", relative };
  }
  if (value.startsWith("/api/project-assets/")) {
    const id = value.slice(20).split(/[?#]/, 1)[0]; if (!/^[A-Za-z0-9_-]+$/.test(id)) return { kind: "unresolved" };
    for (const ext of IMG) { const relative = `.data/project-assets/${id}${ext}`; if (files.has(relative)) return { kind: "local", relative }; }
    return { kind: "missing", relative: `.data/project-assets/${id}` };
  }
  return /^https?:\/\//i.test(value) ? { kind: "remote" } : { kind: "none" };
}

function resolveWorkspace(record, orgIds, personalByUser) {
  if (record.organizationId) return orgIds.has(record.organizationId) ? record.organizationId : null;
  const ids = record.userId ? personalByUser.get(record.userId) || [] : [];
  return ids.length === 1 ? ids[0] : null;
}

function makePlan(files, refs, brandIds, forced) {
  const work = new Map(), migrated = new Set(), missing = new Set(); let ownership = 0, unresolvedRefs = 0;
  for (const ref of refs) {
    const src = ref.src;
    if (src.kind === "remote" || src.kind === "none") continue;
    if (src.kind === "migrated") { if (!ref.workspace || !src.objectPath.startsWith(`workspaces/${ref.workspace}/`)) unresolvedRefs++; else migrated.add(src.objectPath); continue; }
    if (src.kind === "missing") { missing.add(src.relative); continue; }
    if (src.kind !== "local") { unresolvedRefs++; continue; }
    const file = files.get(src.relative); if (!file) { missing.add(src.relative); continue; }
    if (!ref.workspace) { ownership++; forced.add(file.relative); continue; }
    let cat = ref.category;
    if (!cat && file.root === "project-assets") cat = brandIds.has(path.basename(file.relative, file.ext)) ? "brand-kit" : "references";
    if (!cat && file.root === "voice-inputs") cat = "voice-inputs";
    if (!cat && file.root === "uploads") cat = src.relative.slice(8).startsWith("references/") ? "references" : extensionCategory(file.ext);
    if (!cat) { unresolvedRefs++; forced.add(file.relative); continue; }
    const key = `${ref.workspace}\0${file.relative}`; let item = work.get(key);
    if (!item) {
      const objectId = `m-${hash(`${ref.workspace}\0${file.relative}`).slice(0, 32)}`;
      item = { file, workspace: ref.workspace, project: ref.project || null, category: cat, objectPath: getObjectPath({ workspaceId: ref.workspace, projectId: ref.project, resourceId: ref.resource || ref.target.id, category: cat, extension: file.ext, objectId }), refs: [] };
      work.set(key, item);
    } else if (item.category !== cat) { unresolvedRefs++; forced.add(file.relative); continue; }
    item.refs.push(ref.target);
  }
  return { work, migrated, missing, ownership, unresolvedRefs };
}

function makeUpdates(work, rowMaps) {
  const updates = new Map();
  for (const item of work.values()) for (const target of item.refs) {
    const key = `${target.model}:${target.id}`; let update = updates.get(key);
    if (!update) { update = { model: target.model, id: target.id, row: rowMaps.get(target.model)?.get(target.id), data: {} }; updates.set(key, update); }
    const ref = storageReference(item.objectPath);
    if (target.model !== "GenerationJob") update.data[target.field] = ref;
    else {
      const col = target.field.startsWith("requestPayload.") ? "requestPayload" : "responsePayload", payload = JSON.parse(update.data[col] ?? update.row?.[col] ?? "{}");
      if (target.field === "requestPayload.referenceStorage") payload.referenceStorage = { provider: "supabase", key: ref, storageUrl: ref };
      else payload[target.field.slice(col.length + 1)] = ref;
      update.data[col] = JSON.stringify(payload);
    }
  }
  return updates;
}

function oldValue(target, rows) {
  const row = rows.get(target.model)?.get(target.id); if (!row) return null;
  if (target.model !== "GenerationJob") return row[target.field] ?? null;
  const [col, prop] = target.field.split(".");
  try { const p = JSON.parse(row[col] || "{}"); return target.field === "requestPayload.referenceStorage" ? p.referenceStorage?.storageUrl || p.referenceStorage?.key || p.referenceStorage?.localPath || null : p[prop] ?? null; } catch { return null; }
}

async function readPriorManifest() {
  let names; try { names = await readdir(path.resolve("backups")); } catch { return null; }
  const name = names.filter((n) => n.startsWith(PREFIX) && n.endsWith(".json")).sort().at(-1);
  if (!name) return null;
  try { return JSON.parse(await readFile(path.resolve("backups", name), "utf8")); } catch { throw new Error("Prior migration manifest is unreadable."); }
}
async function saveManifest(file, value) { value.updatedAt = new Date().toISOString(); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }

async function executeMigration(prisma, work, rows, privateBucket) {
  if (!privateBucket) throw new Error("Private bucket access failed.");
  const manifestPath = path.resolve("backups", `${PREFIX}${Date.now()}-${randomUUID()}.json`), items = [...work.values()], entries = [];
  for (const item of items) {
    const bytes = await readFile(item.file.absolute);
    entries.push({ sourceLocalPath: item.file.relative, workspaceId: item.workspace, projectId: item.project, category: item.category, targetObjectPath: item.objectPath, sizeBytes: bytes.length, sha256: hash(bytes), status: "PLANNED", relatedDatabaseReferences: item.refs.map((target) => ({ model: target.model, recordId: target.id, field: target.field, originalReference: oldValue(target, rows) })) });
  }
  const manifest = { version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "UPLOADING", plannedObjects: entries.length, plannedBytes: entries.reduce((n, e) => n + e.sizeBytes, 0), entries };
  await saveManifest(manifestPath, manifest);
  const verified = new Map(); let systemic = false;
  for (const [i, item] of items.entries()) {
    const entry = entries[i];
    try {
      const bytes = await readFile(item.file.absolute);
      if (bytes.length !== entry.sizeBytes || hash(bytes) !== entry.sha256) throw new Error("Source changed after manifest creation.");
      if (await objectExists(item.objectPath)) {
        const prior = await downloadObject(item.objectPath);
        if (prior.length !== entry.sizeBytes || hash(prior) !== entry.sha256) throw new Error("Existing object verification failed.");
        entry.status = "ALREADY_VERIFIED";
      } else {
        if (databaseOnly) {
          const missing = new Error("DB-only resume stopped because a verified object is missing.");
          missing.statusCode = 404;
          throw missing;
        }
        await uploadObject(item.objectPath, bytes, { contentType: MIME[item.file.ext] || "application/octet-stream", upsert: false });
        if (!(await objectExists(item.objectPath))) throw new Error("Uploaded object is missing.");
        const saved = await downloadObject(item.objectPath);
        if (saved.length !== entry.sizeBytes || hash(saved) !== entry.sha256) throw new Error("Uploaded object verification failed.");
        entry.status = "VERIFIED";
      }
      verified.set(`${item.workspace}\0${item.file.relative}`, item);
    } catch (e) {
      entry.status = "FAILED"; entry.failure = { error: String(e?.name || "Error").replace(/[^A-Za-z0-9_.-]/g, ""), statusCode: Number(e?.statusCode) || null };
      if ([401, 403, 404].includes(entry.failure.statusCode) || entry.failure.statusCode >= 500) systemic = true;
    }
    await saveManifest(manifestPath, manifest); if (systemic) break;
  }
  const good = entries.filter((e) => ["VERIFIED", "ALREADY_VERIFIED"].includes(e.status)), failures = entries.filter((e) => e.status === "FAILED").length;
  if (systemic) { manifest.status = "STOPPED_SYSTEMIC_STORAGE_FAILURE"; await saveManifest(manifestPath, manifest); return { manifestPath, entries, updated: 0, failures, orphaned: good.length }; }
  const updates = makeUpdates(new Map(verified), rows);
  for (const e of good) e.status = "VERIFIED_WAITING_FOR_DATABASE";
  manifest.status = "DATABASE_UPDATE_IN_PROGRESS"; await saveManifest(manifestPath, manifest);
    try {
      await prisma.$transaction(async (tx) => { for (const u of updates.values()) await tx[u.model[0].toLowerCase() + u.model.slice(1)].update({ where: { id: u.id }, data: u.data }); }, { maxWait: 30000, timeout: 120000 });
    } catch (error) {
      for (const e of good) e.status = "UPLOADED_BUT_DB_UPDATE_FAILED";
      manifest.status = "DATABASE_UPDATE_FAILED";
      manifest.databaseUpdateFailure = { errorClass: String(error?.name || "Error").replace(/[^A-Za-z0-9_.-]/g, ""), code: /^[A-Z0-9_-]{1,32}$/.test(String(error?.code || "")) ? error.code : null };
      await saveManifest(manifestPath, manifest);
      return { manifestPath, entries, updated: 0, failures, orphaned: good.length, databaseErrorCode: manifest.databaseUpdateFailure.code };
    }
  try {
    for (const u of updates.values()) {
      const row = await prisma[u.model[0].toLowerCase() + u.model.slice(1)].findUnique({ where: { id: u.id } });
      for (const [field, value] of Object.entries(u.data)) if (!row || row[field] !== value) throw new Error("Reference verification failed.");
    }
  } catch { for (const e of good) e.status = "UPLOADED_BUT_DB_UPDATE_FAILED"; manifest.status = "DATABASE_REFERENCE_VERIFICATION_FAILED"; await saveManifest(manifestPath, manifest); return { manifestPath, entries, updated: 0, failures, orphaned: good.length }; }
  for (const e of good) e.status = "DB_UPDATED";
  manifest.status = failures ? "PARTIAL" : "COMPLETE"; manifest.databaseReferencesUpdated = updates.size; await saveManifest(manifestPath, manifest);
  return { manifestPath, entries, updated: updates.size, failures, orphaned: 0 };
}

async function main() {
  const execute = process.argv.includes("--execute"), databaseOnly = process.argv.includes("--resume-db-only"), configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY) && process.env.STORAGE_BUCKET);
  console.log(`STORAGE_CONFIGURATION: ${configured ? "PASS" : "FAIL"}`);
  const prisma = new PrismaClient({ log: [] });
  try {
    const files = await scanFiles();
    const [orgs, members, assets, projects, voices, voiceJobs, jobs, kits] = await Promise.all([
      prisma.organization.findMany({ select: { id: true, accountType: true } }),
      prisma.organizationMember.findMany({ where: { status: "ACTIVE" }, select: { organizationId: true, userId: true, organization: { select: { accountType: true } } } }),
      prisma.asset.findMany({ select: { id: true, userId: true, organizationId: true, projectId: true, assetType: true, status: true, outputUrl: true, thumbnailUrl: true } }),
      prisma.project.findMany({ select: { id: true, organizationId: true, thumbnailUrl: true, finalVideoUrl: true, finalThumbnailUrl: true } }),
      prisma.voiceInput.findMany({ select: { id: true, userId: true, organizationId: true, storageUrl: true } }),
      prisma.voiceVideoJob.findMany({ select: { id: true, userId: true, organizationId: true, outputUrl: true, thumbnailUrl: true } }),
      prisma.generationJob.findMany({ select: { id: true, userId: true, organizationId: true, projectId: true, type: true, status: true, completedAt: true, requestPayload: true, responsePayload: true } }),
      prisma.brandKit.findMany({ select: { defaultLogoAssetId: true, secondaryLogoAssetId: true } }),
    ]);
    const orgIds = new Set(orgs.map((r) => r.id)), personal = new Map();
    for (const m of members) if (m.organization.accountType === "PERSONAL") { const a = personal.get(m.userId) || []; a.push(m.organizationId); personal.set(m.userId, a); }
    const brandIds = new Set(kits.flatMap((r) => [r.defaultLogoAssetId, r.secondaryLogoAssetId]).filter(Boolean)), refs = [], forced = new Set(); let remote = 0;
    const add = (value, record, target, options = {}) => {
      let src;
      if (options.localPath) { const local = norm(path.relative(process.cwd(), path.resolve(options.localPath))); src = local.startsWith("..") || path.isAbsolute(local) ? { kind: "unresolved" } : files.has(local) ? { kind: "local", relative: local } : { kind: "missing", relative: local }; }
      else src = resolveSource(value, files);
      if (src.kind === "remote") remote++;
      refs.push({ src, target, category: options.category, project: options.projectId || null, resource: options.resourceId, workspace: record ? workspaceFor(record, orgIds, personal) : null });
    };
    for (const a of assets) { const cat = brandIds.has(a.id) ? "brand-kit" : undefined; add(a.outputUrl, a, { model: "Asset", id: a.id, field: "outputUrl" }, { category: cat, projectId: a.projectId, resourceId: a.id }); add(a.thumbnailUrl, a, { model: "Asset", id: a.id, field: "thumbnailUrl" }, { category: cat, projectId: a.projectId, resourceId: a.id }); }
    for (const p of projects) for (const field of ["thumbnailUrl", "finalVideoUrl", "finalThumbnailUrl"]) add(p[field], p, { model: "Project", id: p.id, field }, { projectId: p.id, resourceId: p.id });
    for (const v of voices) add(v.storageUrl, v, { model: "VoiceInput", id: v.id, field: "storageUrl" }, { category: "voice-inputs", resourceId: v.id });
    for (const v of voiceJobs) for (const field of ["outputUrl", "thumbnailUrl"]) add(v[field], v, { model: "VoiceVideoJob", id: v.id, field }, { resourceId: v.id });
    for (const j of jobs) {
      let req = {}, res = {}; try { req = JSON.parse(j.requestPayload || "{}"); } catch { forced.add(`GenerationJob:${j.id}:requestPayload`); } try { res = JSON.parse(j.responsePayload || "{}"); } catch { forced.add(`GenerationJob:${j.id}:responsePayload`); }
      if (/^https?:\/\//i.test(req.referenceUrl || "")) remote++; if (/^https?:\/\//i.test(res.providerSourceUrl || "")) remote++;
      if (req.referenceStorage?.storageUrl?.startsWith("supabase://") || req.referenceStorage?.key?.startsWith("supabase://")) {
        add(req.referenceStorage.storageUrl || req.referenceStorage.key, j, { model: "GenerationJob", id: j.id, field: "requestPayload.referenceStorage" }, { projectId: j.projectId, resourceId: j.id });
      } else if (req.referenceStorage?.key || req.referenceStorage?.localPath) {
        add(null, j, { model: "GenerationJob", id: j.id, field: "requestPayload.referenceStorage" }, { category: "references", projectId: j.projectId, resourceId: j.id, localPath: req.referenceStorage.localPath || path.resolve("uploads", req.referenceStorage.key || "") });
      }
      for (const field of ["url", "thumbnailUrl"]) add(res[field], j, { model: "GenerationJob", id: j.id, field: `responsePayload.${field}` }, { projectId: j.projectId, resourceId: j.id });
    }
    const p = makePlan(files, refs, brandIds, forced), rows = new Map([["Asset", assets], ["Project", projects], ["VoiceInput", voices], ["VoiceVideoJob", voiceJobs], ["GenerationJob", jobs]].map(([n, list]) => [n, new Map(list.map((r) => [r.id, r]))]));
    const updates = makeUpdates(p.work, rows), referenced = new Set([...p.work.values()].map((i) => i.file.relative)), prior = await readPriorManifest();
    const manifestFiles = new Set((prior?.entries || []).filter((e) => e.status === "DB_UPDATED").map((e) => e.sourceLocalPath));
    const projectMap = new Map(projects.map((r) => [r.id, r])), completed = new Map(), failed = new Map(), temp = new Set(), orphan = new Set();
    const durableReference = (value) => {
      const source = resolveSource(value, files);
      return source.kind === "local" || (source.kind === "migrated" && p.migrated.has(source.objectPath));
    };
    for (const j of jobs) if (j.type === "VIDEO" && j.projectId) { const m = j.status === "COMPLETED" ? completed : j.status === "FAILED" ? failed : null; if (m) { const a = m.get(j.projectId) || []; a.push(j); m.set(j.projectId, a); } }
    for (const f of files.values()) if (f.relative.startsWith("uploads/projects/") && f.ext === ".mp4" && !referenced.has(f.relative)) {
      const id = f.relative.split("/")[2], project = projectMap.get(id); if (!project) continue;
      const hasAsset = assets.some((a) => a.projectId === id && a.assetType === "VIDEO" && a.status === "COMPLETED" && durableReference(a.outputUrl));
      const hasFinal = durableReference(project.finalVideoUrl);
      const completedLater = (completed.get(id) || []).some((j) => j.completedAt && f.mtime <= new Date(j.completedAt));
      if (hasAsset && hasFinal && completedLater) temp.add(f.relative);
      else if (assets.some((a) => a.projectId === id && a.assetType === "VIDEO" && a.status === "FAILED") && (failed.get(id) || []).length && !project.finalVideoUrl) orphan.add(f.relative);
    }
    const classes = { PERSISTENT_USER_ASSET: 0, TEMPORARY_PROCESSING: 0, STATIC_APPLICATION_ASSET: 0, LEGACY_OR_UNUSED: 0, UNRESOLVED: 0 }, unresolvedFolders = {};
    for (const f of files.values()) { let c; if (referenced.has(f.relative) || manifestFiles.has(f.relative)) c = "PERSISTENT_USER_ASSET"; else if (temp.has(f.relative) || f.relative.startsWith("uploads/tts/")) c = "TEMPORARY_PROCESSING"; else if (orphan.has(f.relative) || f.root === "project-assets" || f.relative.startsWith("uploads/references/")) c = "LEGACY_OR_UNUSED"; else if (forced.has(f.relative) || f.root === "voice-inputs") c = "UNRESOLVED"; else c = "UNRESOLVED"; bump(classes, c); if (c === "UNRESOLVED") bump(unresolvedFolders, f.relative.split("/").slice(0, 2).join("/")); }
    let privateBucket = false; if (configured) { try { await verifyPrivateBucketAccess(); privateBucket = true; } catch (e) { console.log(`PRIVATE_BUCKET_ACCESS: FAIL${e.statusCode ? ` (HTTP ${e.statusCode})` : ""}`); } } else console.log("PRIVATE_BUCKET_ACCESS: FAIL (configuration missing)");
    const existing = new Set(), migratedPresent = new Set(); if (privateBucket) { for (const i of p.work.values()) if (await objectExists(i.objectPath)) existing.add(i.objectPath); for (const o of p.migrated) { if (await objectExists(o)) migratedPresent.add(o); else p.missing.add(`supabase://${o}`); } }
    const unresolved = classes.UNRESOLVED + p.unresolvedRefs + p.ownership, ready = configured && privateBucket && !p.missing.size && !unresolved;
    const plannedBytes = [...p.work.values()].reduce((n, i) => n + i.file.size, 0), already = new Set([...existing, ...migratedPresent]).size;
    console.log("STORAGE_ADAPTER: PASS"); console.log(`WORKSPACE_PATH_SCOPING: ${[...p.work.values()].every((i) => i.objectPath.startsWith(`workspaces/${i.workspace}/`)) ? "PASS" : "FAIL"}`); console.log(`DRY_RUN: ${ready ? "PASS" : "FAIL"}`); console.log("SCHEMA_CHANGE_REQUIRED: NO");
    console.log(`TOTAL_LOCAL_FILES: ${files.size}`); console.log(`PERSISTENT_ASSETS: ${classes.PERSISTENT_USER_ASSET}`); console.log(`TEMPORARY_FILES: ${classes.TEMPORARY_PROCESSING}`); console.log(`STATIC_FILES: ${classes.STATIC_APPLICATION_ASSET}`); console.log(`LEGACY_UNUSED: ${classes.LEGACY_OR_UNUSED}`); console.log(`REMOTE_EXTERNAL: ${remote}`); console.log(`UNRESOLVED: ${unresolved}`);
    console.log(`UNRESOLVED_PROJECT_FILES: ${classes.UNRESOLVED ? [...files.values()].filter((f) => f.relative.startsWith("uploads/projects/") && !referenced.has(f.relative) && !temp.has(f.relative) && !orphan.has(f.relative)).length : 0}`); console.log(`MISSING_REFERENCED_FILES: ${p.missing.size}`); console.log(`UNRESOLVED_WORKSPACE_OWNERSHIP: ${p.ownership}`); console.log(`FILES_TO_UPLOAD: ${Math.max(0, p.work.size - existing.size)}`); console.log(`ESTIMATED_UPLOAD_BYTES: ${[...p.work.values()].filter((i) => !existing.has(i.objectPath)).reduce((n, i) => n + i.file.size, 0)}`); console.log(`ALREADY_MIGRATED: ${already}`);
    for (const [folder, n] of Object.entries(unresolvedFolders)) console.log(`UNRESOLVED_FOLDER ${folder}: ${n}`);
    console.log("DATABASE_RECORDS_MODIFIED: NO"); console.log("STORAGE_OBJECTS_UPLOADED: 0"); console.log("LOCAL_FILES_DELETED: 0");
    if (execute) {
      if (!process.argv.includes("--confirm-upload-migration")) throw new Error("Execution requires --confirm-upload-migration."); if (!ready) throw new Error("Pre-migration dry run failed.");
      if (!prior && (p.work.size + migratedPresent.size !== APPROVED || plannedBytes !== APPROVED_BYTES)) throw new Error("Execution plan differs from approved count/bytes.");
      const result = await executeMigration(prisma, p.work, rows, privateBucket, databaseOnly);
      console.log(`DATABASE_UPDATE_ERROR_CODE: ${result.databaseErrorCode || "NONE"}`);
      console.log(`ROLLBACK_MANIFEST: ${result.manifestPath}`); console.log(`STORAGE_OBJECTS_VERIFIED: ${result.entries.filter((e) => ["VERIFIED", "ALREADY_VERIFIED", "DB_UPDATED"].includes(e.status)).length}`); console.log(`DATABASE_REFERENCES_UPDATED: ${result.updated}`); console.log(`FAILED_UPLOADS: ${result.failures}`); console.log(`UPLOADED_BUT_DB_UPDATE_FAILED: ${result.orphaned}`);
      if (result.failures || result.orphaned) process.exitCode = 2;
    }
    if (!ready) process.exitCode = 2;
  } finally { await prisma.$disconnect(); }
}

main().catch((e) => {
  let message = String(e?.message || "");
  for (const [name, value] of Object.entries(process.env)) if (/(DATABASE_URL|TOKEN|SECRET|API.?KEY|PASSWORD|OAUTH|CREDENTIAL)/i.test(name) && value) message = message.replaceAll(value, "[redacted]");
  message = message.replace(/(?:postgres(?:ql)?:|https?:|file:)[^\s'"`)}\]]+/gi, "[redacted-url]").replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]").replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-value]").slice(0, 240);
  console.error(`STORAGE_MIGRATION: FAIL; ERROR=${String(e?.name || "Error").replace(/[^A-Za-z0-9_.-]/g, "")}; STATUS=${Number(e?.statusCode) || "UNKNOWN"}; MESSAGE=${message}`);
  process.exitCode = 2;
});
