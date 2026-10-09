import test from "node:test";
import assert from "node:assert/strict";

import { resolveMuApiKey } from "../lib/providerCredentials.js";

function database(accountType, membershipStatus, credential) {
  const calls = [];
  return {
    calls,
    organization: { findUnique: async () => ({ accountType }) },
    organizationMember: { findUnique: async () => ({ status: membershipStatus }) },
    providerCredential: {
      findFirst: async (query) => { calls.push(query); return credential; },
    },
  };
}

test("organization generation never falls back to a member's personal key", async () => {
  const prisma = database("ORGANIZATION", "ACTIVE", null);
  await assert.rejects(resolveMuApiKey(prisma, "org-a", "member"), /MUAPI_NOT_CONNECTED_FOR_ORGANIZATION/);
  assert.deepEqual(prisma.calls[0].where, { provider: "MUAPI", organizationId: "org-a" });
});

test("personal generation looks up only the authenticated user's personal connection", async () => {
  const prisma = database("PERSONAL", "ACTIVE", null);
  await assert.rejects(resolveMuApiKey(prisma, "personal-a", "owner"), /MUAPI_NOT_CONNECTED/);
  assert.deepEqual(prisma.calls[0].where, { provider: "MUAPI", userId: "owner", organizationId: null });
});

test("nonmembers cannot resolve organization credentials", async () => {
  const prisma = database("ORGANIZATION", "SUSPENDED", { secretEncrypted: "unused" });
  await assert.rejects(resolveMuApiKey(prisma, "org-a", "stranger"), /NOT_ORGANIZATION_MEMBER/);
  assert.equal(prisma.calls.length, 0);
});