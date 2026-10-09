import test from "node:test";
import assert from "node:assert/strict";

import { assetWorkspaceWhere } from "../lib/assetWorkspaceScope.js";

test("organization assets belong only to the active organization, including team members", () => {
  assert.deepEqual(assetWorkspaceWhere({ accountType: "ORGANIZATION", organizationId: "org-a", userId: "member" }), { organizationId: "org-a" });
});

test("personal assets include legacy personal workspace records but never another user's records", () => {
  assert.deepEqual(assetWorkspaceWhere({ accountType: "PERSONAL", organizationId: "personal-a", userId: "owner" }), {
    userId: "owner", OR: [{ organizationId: "personal-a" }, { organizationId: null }],
  });
});

test("personal asset scope excludes the user's organization assets", () => {
  const where = assetWorkspaceWhere({ accountType: "PERSONAL", organizationId: "personal-a", userId: "owner" });
  const visible = (asset) => asset.userId === where.userId && where.OR.some((scope) => asset.organizationId === scope.organizationId);
  assert.equal(visible({ userId: "owner", organizationId: "personal-a" }), true);
  assert.equal(visible({ userId: "owner", organizationId: null }), true);
  assert.equal(visible({ userId: "owner", organizationId: "org-a" }), false);
  assert.equal(visible({ userId: "another-user", organizationId: null }), false);
});