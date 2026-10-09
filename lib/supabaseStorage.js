import "server-only";

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const workspaceCategories = new Set(["images", "videos", "audio", "references"]);
const rootCategories = new Set(["brand-kit", "voice-inputs"]);
const signedUrlMaxSeconds = 60 * 60;
let client;

function storageConfig() {
  const url = process.env.SUPABASE_URL;
  const credential = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.STORAGE_BUCKET;
  if (!url || !credential || !bucket) {
    throw new Error("Supabase Storage requires SUPABASE_URL, a server storage credential, and STORAGE_BUCKET.");
  }
  if (/^NEXT_PUBLIC_/i.test(Object.keys(process.env).find((name) => process.env[name] === credential) || "")) {
    throw new Error("The Supabase Storage credential must be server-only.");
  }
  return { url, credential, bucket };
}

function storageClient() {
  if (!client) {
    const { url, credential } = storageConfig();
    client = createClient(url, credential, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }).storage;
  }
  return client;
}

function safeSegment(value, label) {
  const segment = String(value || "");
  if (!segment || segment === "." || segment === ".." || !/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/.test(segment)) {
    throw new Error(`Invalid ${label} for a storage path.`);
  }
  return segment;
}

function safeExtension(value) {
  const extension = String(value || "").toLowerCase();
  if (!extension) return "";
  if (!/^\.[a-z0-9]{1,10}$/.test(extension)) throw new Error("Invalid storage file extension.");
  return extension;
}

export function getObjectPath({ workspaceId, projectId, resourceId, category, extension = "", objectId }) {
  const workspace = safeSegment(workspaceId, "workspace ID");
  const normalizedCategory = String(category || "");
  let scope;
  if (workspaceCategories.has(normalizedCategory)) {
    scope = projectId
      ? `projects/${safeSegment(projectId, "project ID")}`
      : `assets/${safeSegment(resourceId, "asset ID")}`;
  } else if (rootCategories.has(normalizedCategory)) {
    const name = objectId ? safeSegment(objectId, "object ID") : randomUUID();
    return `workspaces/${workspace}/${normalizedCategory}/${name}${safeExtension(extension)}`;
  } else {
    throw new Error("Unsupported workspace storage category.");
  }
  const name = objectId ? safeSegment(objectId, "object ID") : randomUUID();
  return `workspaces/${workspace}/${scope}/${normalizedCategory}/${name}${safeExtension(extension)}`;
}

export function storageReference(objectPath) {
  const path = validateObjectPath(objectPath);
  return `supabase://${path}`;
}

export function objectPathFromReference(reference) {
  const value = String(reference || "");
  if (!value.startsWith("supabase://")) return null;
  return validateObjectPath(value.slice("supabase://".length));
}

function validateObjectPath(value) {
  const objectPath = String(value || "");
  const segments = objectPath.split("/");
  if (segments.length < 4 || segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9_.-]+$/.test(segment)) || segments[0] !== "workspaces") {
    throw new Error("Invalid workspace storage object path.");
  }
  return objectPath;
}

function throwStorageError(error, operation) {
  if (error) {
    const statusCode = Number(error.statusCode) || null;
    const failure = new Error(`Supabase Storage ${operation} failed${statusCode ? ` (HTTP ${statusCode})` : ""}.`);
    failure.name = "SupabaseStorageError";
    failure.statusCode = statusCode;
    throw failure;
  }
}

export async function verifyPrivateBucketAccess() {
  const { bucket } = storageConfig();
  const storage = storageClient();
  const { data, error } = await storage.getBucket(bucket);
  throwStorageError(error, "bucket verification");
  if (!data || data.public !== false) throw new Error("The configured Supabase Storage bucket must be private.");
  const listed = await storage.from(bucket).list("", { limit: 1 });
  throwStorageError(listed.error, "private bucket access verification");
  return { bucket: data.id, isPrivate: true };
}

export async function uploadObject(objectPath, body, { contentType = "application/octet-stream", upsert = false, cacheControl = "3600" } = {}) {
  const { bucket } = storageConfig();
  const path = validateObjectPath(objectPath);
  const { data, error } = await storageClient().from(bucket).upload(path, body, { contentType, upsert, cacheControl });
  throwStorageError(error, "upload");
  return data;
}

export async function downloadObject(objectPath) {
  const { bucket } = storageConfig();
  const path = validateObjectPath(objectPath);
  const { data, error } = await storageClient().from(bucket).download(path);
  throwStorageError(error, "download");
  return Buffer.from(await data.arrayBuffer());
}

export async function objectExists(objectPath) {
  const { bucket } = storageConfig();
  const path = validateObjectPath(objectPath);
  const segments = path.split("/");
  const fileName = segments.pop();
  const { data, error } = await storageClient().from(bucket).list(segments.join("/"), { search: fileName, limit: 100 });
  throwStorageError(error, "object verification");
  return data.some((item) => item.name === fileName);
}

export async function removeObject(objectPath) {
  const { bucket } = storageConfig();
  const path = validateObjectPath(objectPath);
  const { error } = await storageClient().from(bucket).remove([path]);
  throwStorageError(error, "remove");
}

export async function createObjectSignedUrl(objectPath, expiresIn = 300) {
  const { bucket } = storageConfig();
  const path = validateObjectPath(objectPath);
  const lifetime = Math.max(1, Math.min(signedUrlMaxSeconds, Number(expiresIn) || 300));
  const { data, error } = await storageClient().from(bucket).createSignedUrl(path, lifetime);
  throwStorageError(error, "signed URL creation");
  return data.signedUrl;
}