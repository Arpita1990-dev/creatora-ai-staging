import "server-only";

import { createObjectSignedUrl, downloadObject, objectPathFromReference } from "./supabaseStorage.js";

export function assertWorkspaceObject(reference, workspaceId) {
  const objectPath = objectPathFromReference(reference);
  if (!objectPath) return null;
  if (!workspaceId || !objectPath.startsWith(`workspaces/${workspaceId}/`)) {
    throw new Error("Storage object is outside the active workspace.");
  }
  return objectPath;
}

export async function mediaUrlForWorkspace(reference, workspaceId, expiresIn = 300) {
  const objectPath = assertWorkspaceObject(reference, workspaceId);
  return objectPath ? createObjectSignedUrl(objectPath, expiresIn) : reference;
}

export async function mediaBytesForWorkspace(reference, workspaceId) {
  const objectPath = assertWorkspaceObject(reference, workspaceId);
  if (!objectPath) throw new Error("A Supabase Storage reference is required.");
  return downloadObject(objectPath);
}
