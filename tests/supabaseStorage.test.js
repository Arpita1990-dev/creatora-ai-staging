import test from "node:test";
import assert from "node:assert/strict";

import { getObjectPath, objectPathFromReference, storageReference } from "../lib/supabaseStorage.js";
import { assertWorkspaceObject } from "../lib/mediaDelivery.js";

test("storage objects are scoped to the workspace and requested project/category", () => {
  const objectPath = getObjectPath({
    workspaceId: "personal-workspace-1",
    projectId: "project-1",
    category: "videos",
    extension: ".mp4",
    objectId: "generated-video-1",
  });
  assert.equal(objectPath, "workspaces/personal-workspace-1/projects/project-1/videos/generated-video-1.mp4");
});

test("workspace-level brand kit and voice input paths do not duplicate category names", () => {
  assert.match(getObjectPath({ workspaceId: "org-1", category: "brand-kit", extension: ".png", objectId: "logo-1" }), /^workspaces\/org-1\/brand-kit\/logo-1\.png$/);
  assert.match(getObjectPath({ workspaceId: "org-1", category: "voice-inputs", extension: ".webm", objectId: "voice-1" }), /^workspaces\/org-1\/voice-inputs\/voice-1\.webm$/);
});

test("object paths and stable references round-trip without allowing traversal", () => {
  const objectPath = getObjectPath({ workspaceId: "org-1", resourceId: "asset-1", category: "images", extension: ".webp", objectId: "image-1" });
  assert.equal(objectPathFromReference(storageReference(objectPath)), objectPath);
  assert.throws(() => getObjectPath({ workspaceId: "../other", category: "brand-kit" }), /Invalid workspace ID/);
  assert.throws(() => objectPathFromReference("supabase://workspaces/org-1/../private/file.jpg"), /Invalid workspace storage object path/);
});

test("media references cannot cross workspace boundaries", () => {
  const reference = "supabase://workspaces/org-1/projects/project-1/images/image-1.png";
  assert.equal(assertWorkspaceObject(reference, "org-1"), "workspaces/org-1/projects/project-1/images/image-1.png");
  assert.throws(() => assertWorkspaceObject(reference, "org-2"), /outside the active workspace/);
});
