import test from "node:test";
import assert from "node:assert/strict";

import { getProviderCredentialScope } from "../lib/providerCredentialScope.js";

test("personal MuAPI credentials use Prisma's generated compound unique key", () => {
  assert.deepEqual(
    getProviderCredentialScope({ shared: false, organizationId: "org-1", userId: "user-1" }),
    {
      where: { provider_userId: { provider: "MUAPI", userId: "user-1" } },
      create: { provider: "MUAPI", userId: "user-1" },
    }
  );
});

test("organization MuAPI credentials use Prisma's generated compound unique key", () => {
  assert.deepEqual(
    getProviderCredentialScope({ shared: true, organizationId: "org-1", userId: "user-1" }),
    {
      where: { provider_organizationId: { provider: "MUAPI", organizationId: "org-1" } },
      create: { provider: "MUAPI", organizationId: "org-1" },
    }
  );
});
