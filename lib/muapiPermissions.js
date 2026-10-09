import { canManageOrganizationResources } from "./organizationPermissions.js";

// Kept as the MuAPI-facing entry point; the rule itself now lives in
// organizationPermissions.js so social credentials resolve the same way.
export function canManageMuApi(organization, membership, userId) {
  return canManageOrganizationResources({ organization, membership, userId });
}