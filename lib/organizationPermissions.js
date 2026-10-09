// Single source of truth for "may this user administer shared workspace
// resources (MuAPI credentials, social connections)".
//
// Ownership is represented twice in the data model: Organization.ownerId is the
// authoritative owner, and OrganizationMember.role carries OWNER / ADMIN /
// EDITOR / ... So a role comparison alone is not enough — an owner whose
// membership row is stale or missing would silently lose access.
export function canManageOrganizationResources({ organization, membership, userId }) {
  if (organization?.accountType !== "ORGANIZATION") return true;
  if (!userId) return false;
  if (organization.ownerId === userId) return true;
  if (!membership || membership.status !== "ACTIVE") return false;
  return membership.role === "OWNER" || membership.role === "ADMIN";
}

// Publishing to a connected destination is allowed for editors as well, so
// credential management is intentionally narrower than publishing.
export function canPublishToWorkspace({ organization, membership, userId }) {
  if (organization?.accountType !== "ORGANIZATION") return true;
  if (!userId) return false;
  if (organization.ownerId === userId) return true;
  if (!membership || membership.status !== "ACTIVE") return false;
  return ["OWNER", "ADMIN", "EDITOR"].includes(membership.role);
}