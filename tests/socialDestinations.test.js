import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../lib/prisma.js";
import { partitionNewDestinations, syncDestinations, annotatePlanLimits } from "../lib/socialDestinations.js";
import { persistSocialConnection } from "../lib/socialConnectionPersistence.js";

test("destination persistence rejects a Creator's second Facebook/Instagram account before writes", async () => {
  const findUnique = prisma.organization.findUnique;
  const transaction = prisma.$transaction;
  const findMany = prisma.socialDestination.findMany;
  let writes = 0;
  let existing = [];
  prisma.organization.findUnique = async () => ({ subscription: { status: "ACTIVE", plan: { code: "creator" } } });
  prisma.socialDestination.findMany = async () => [];
  prisma.$transaction = async (operation, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    return operation({ socialDestination: { findMany: async () => existing, upsert: async () => { writes += 1; } } });
  };
  try {
    for (const accountType of ["FACEBOOK_PAGE", "INSTAGRAM_BUSINESS"]) {
      const connection = { id: "connection-current", userId: null, organizationId: "org-current", provider: "META" };
      existing = [];
      await syncDestinations(connection, [{ providerAccountId: "first", accountType }]);
      assert.equal(writes, accountType === "FACEBOOK_PAGE" ? 1 : 2);
      existing = [{ providerAccountId: "first", accountType, socialConnectionId: "connection-current", status: "CONNECTED" }];
      await assert.rejects(syncDestinations(connection, [{ providerAccountId: "second", accountType }]), { code: "UPGRADE_REQUIRED" });
      assert.equal(writes, accountType === "FACEBOOK_PAGE" ? 1 : 2);
    }
  } finally { prisma.organization.findUnique = findUnique; prisma.$transaction = transaction; prisma.socialDestination.findMany = findMany; }
});

test("Free destinations are marked unavailable at zero capacity", () => {
  const rows = annotatePlanLimits([{ id: "page-test", accountType: "FACEBOOK_PAGE", status: "CONNECTED" }], { maxFacebookAccounts: 0 });
  assert.equal(rows[0].overLimit, true);
});

test("LinkedIn member and organization destinations share one plan allowance", () => {
  const rows = annotatePlanLimits([
    { id: "member-test", accountType: "LINKEDIN_MEMBER", status: "CONNECTED" },
    { id: "organization-test", accountType: "LINKEDIN_ORGANIZATION", status: "CONNECTED" },
  ], { maxLinkedInAccounts: 1 });
  assert.equal(rows[0].overLimit, false);
  assert.equal(rows[1].overLimit, true);
});

test("destination partition checks existing accounts only in the active organization", async () => {
  const originalFindMany = prisma.socialDestination.findMany;
  let query;
  prisma.socialDestination.findMany = async (args) => {
    query = args;
    return [{ providerAccountId: "page-a", accountName: "Page A" }];
  };

  try {
    const result = await partitionNewDestinations(
      { id: "connection-current", userId: null, organizationId: "org-current", provider: "META" },
      [
        { providerAccountId: "page-a", accountName: "Page A" },
        { providerAccountId: "page-b", accountName: "Page B" },
      ],
    );

    assert.deepEqual(query.where, {
      userId: null,
      organizationId: "org-current",
      provider: "META",
      providerAccountId: { in: ["page-a", "page-b"] },
      socialConnectionId: { not: "connection-current" },
    });
    assert.deepEqual(result.records.map((record) => record.providerAccountId), ["page-b"]);
    assert.deepEqual(result.duplicates.map((record) => record.providerAccountId), ["page-a"]);
  } finally {
    prisma.socialDestination.findMany = originalFindMany;
  }
});

test("reconnecting an inactive account reuses its workspace-scoped connection row", async () => {
  const originalFindFirst = prisma.socialConnection.findFirst;
  const originalUpdate = prisma.socialConnection.update;
  const pending = { id: "pending", userId: null, organizationId: "org-current", provider: "META" };
  const inactive = { id: "inactive", ...pending, status: "ERROR", providerAccountId: "meta-user" };
  const updates = [];
  let lookup;
  prisma.socialConnection.findFirst = async (args) => { lookup = args; return inactive; };
  prisma.socialConnection.update = async (args) => {
    updates.push(args);
    return { ...(args.where.id === inactive.id ? inactive : pending), ...args.data };
  };

  try {
    const saved = await persistSocialConnection(pending, "meta-user", {
      accountName: "Test Meta account",
      accessTokenEncrypted: "test-ciphertext",
    });

    assert.equal(saved.id, inactive.id);
    assert.deepEqual(lookup.where, {
      organizationId: "org-current",
      userId: null,
      provider: "META",
      providerAccountId: "meta-user",
      id: { not: "pending" },
    });
    assert.equal(updates[0].where.id, inactive.id);
    assert.equal(updates[0].data.status, "CONNECTED");
    assert.equal(updates[1].where.id, pending.id);
    assert.equal(updates[1].data.status, "DISCONNECTED");
    assert.equal(updates[1].data.accessTokenEncrypted, null);
  } finally {
    prisma.socialConnection.findFirst = originalFindFirst;
    prisma.socialConnection.update = originalUpdate;
  }
});

test("reauthorizing a connected account refreshes that row without creating a duplicate", async () => {
  const originalFindFirst = prisma.socialConnection.findFirst;
  const originalUpdate = prisma.socialConnection.update;
  const pending = { id: "pending-linkedin", userId: "user-1", organizationId: null, provider: "LINKEDIN" };
  const connected = { id: "linkedin-1", userId: "user-1", organizationId: null, provider: "LINKEDIN", status: "CONNECTED", providerAccountId: "member-1" };
  const updates = [];
  prisma.socialConnection.findFirst = async () => connected;
  prisma.socialConnection.update = async (args) => {
    updates.push(args);
    return { ...(args.where.id === connected.id ? connected : pending), ...args.data };
  };

  try {
    const saved = await persistSocialConnection(pending, "member-1", {
      accountName: "Arpita Das",
      accessTokenEncrypted: "new-ciphertext",
    });

    assert.equal(saved.id, connected.id);
    assert.equal(updates[0].where.id, connected.id);
    assert.equal(updates[0].data.accessTokenEncrypted, "new-ciphertext");
    assert.equal(updates[0].data.status, "CONNECTED");
    assert.equal(updates[1].where.id, pending.id);
    assert.equal(updates[1].data.status, "DISCONNECTED");
    assert.equal(updates[1].data.accessTokenEncrypted, null);
  } finally {
    prisma.socialConnection.findFirst = originalFindFirst;
    prisma.socialConnection.update = originalUpdate;
  }
});
