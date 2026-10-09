import test from "node:test";
import assert from "node:assert/strict";

import { collapseProjectsByCategory, projectCategoryKey, projectStatusHistory, uniqueProjectAssets } from "../lib/projectCategories.js";

test("normalizes project categories without merging distinct names", () => {
  assert.equal(projectCategoryKey("  Restaurant   Add "), "restaurant add");
  assert.notEqual(projectCategoryKey("Restaurant Add"), projectCategoryKey("Restaurant Add lunch"));
});

test("keeps one completed and one failed card for the same category", () => {
  const groups = collapseProjectsByCategory([
    { id: "failed-new", name: "Restaurant Add", status: "FAILED", updatedAt: "2026-10-03T10:00:00Z" },
    { id: "failed-old", name: "restaurant add", status: "FAILED", updatedAt: "2026-10-01T10:00:00Z" },
    { id: "complete-old", name: " restaurant  add ", status: "COMPLETED", updatedAt: "2026-10-02T10:00:00Z" },
    { id: "lunch", name: "Restaurant Add lunch", status: "COMPLETED", updatedAt: "2026-10-01T10:00:00Z" },
  ]);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].project.id, "failed-new");
  assert.deepEqual(groups[0].projectIds, ["failed-new", "failed-old"]);
  assert.equal(groups[1].project.id, "complete-old");
  assert.equal(groups[2].project.id, "lunch");
});

test("uses the newest project when duplicate statuses match", () => {
  const groups = collapseProjectsByCategory([
    { id: "older", name: "Restaurant Add", status: "FAILED", updatedAt: "2026-10-01T10:00:00Z" },
    { id: "newer", name: "Restaurant Add", status: "FAILED", updatedAt: "2026-10-03T10:00:00Z" },
  ]);
  assert.equal(groups[0].project.id, "newer");
});

test("dashboard status history counts every project row, including repeated names", () => {
  const history = projectStatusHistory([
    { id: "complete-a", name: "Restaurant Ads", status: "COMPLETED" },
    { id: "complete-b", name: "restaurant ads", status: "COMPLETED" },
    { id: "complete-c", name: "Cafe Promo", status: "COMPLETED" },
    { id: "failed-a", name: "Restaurant Ads", status: "FAILED" },
  ]);
  const counts = history.reduce((result, project) => {
    result[project.status] = (result[project.status] || 0) + 1;
    return result;
  }, {});

  assert.equal(history.length, 4);
  assert.equal(counts.COMPLETED, 3);
  assert.equal(counts.FAILED, 1);
});

test("project assets collapse identical media but preserve same-title variations", () => {
  const assets = uniqueProjectAssets([
    { id: "one", title: "restaurant ads.jpeg", assetType: "IMAGE", outputUrl: "/uploads/restaurant-1.jpeg" },
    { id: "repeat", title: "restaurant ads.jpeg", assetType: "IMAGE", outputUrl: "/uploads/restaurant-1.jpeg" },
    { id: "variation", title: "restaurant ads.jpeg", assetType: "IMAGE", outputUrl: "/uploads/restaurant-2.jpeg" },
  ]);

  assert.deepEqual(assets.map((asset) => asset.id), ["one", "variation"]);
});

test("same reference bytes deduplicate across random storage URLs", () => {
  const assets = uniqueProjectAssets([
    { id: "reference-one", title: "restaurant ads.jpeg", assetType: "IMAGE", outputUrl: "/api/project-assets/reference-one", contentFingerprint: "same-bytes" },
    { id: "reference-two", title: "restaurant ads.jpeg", assetType: "IMAGE", outputUrl: "/api/project-assets/reference-two", contentFingerprint: "same-bytes" },
    { id: "different-image", title: "restaurant ads.jpeg", assetType: "IMAGE", outputUrl: "/api/project-assets/different-image", contentFingerprint: "different-bytes" },
  ]);

  assert.deepEqual(assets.map((asset) => asset.id), ["reference-one", "different-image"]);
});
