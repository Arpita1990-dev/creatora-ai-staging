export function projectCategoryKey(name) {
  return String(name || "Untitled project").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function projectStatusKey(status) {
  if (status === "ACTIVE") return "IN_PROGRESS";
  if (status === "DRAFT") return "NOT_STARTED";
  return String(status || "NOT_STARTED").toUpperCase();
}

export function projectStatusHistory(projects) {
  return (projects || []).map(({ id, status, createdAt, updatedAt }) => ({ id, status, createdAt, updatedAt }));
}

function timestamp(project) {
  return new Date(project.updatedAt || project.createdAt || 0).getTime() || 0;
}

// Repeated generation attempts may have produced several historical rows with
// the same user-facing project name and outcome. Keep those rows and their
// assets, but expose one card for each category + outcome in the Projects UI.
// This preserves one FAILED card alongside one COMPLETED card while collapsing
// repeated failures and repeated completions.
export function collapseProjectsByCategory(projects) {
  const groups = new Map();
  for (const project of projects || []) {
    const categoryKey = projectCategoryKey(project.name);
    const statusKey = projectStatusKey(project.status);
    const key = `${categoryKey}::${statusKey}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { key, categoryKey, statusKey, project, projectIds: [project.id] });
      continue;
    }
    if (timestamp(project) > timestamp(group.project)) group.project = project;
    group.projectIds.push(project.id);
  }
  return [...groups.values()];
}

export function uniqueProjectAssets(assets) {
  const seenMedia = new Set();
  return (assets || []).filter((asset) => {
    const mediaUrl = asset.outputUrl || asset.thumbnailUrl;
    if (!mediaUrl && !asset.contentFingerprint) return true;
    const mediaIdentity = asset.contentFingerprint || mediaUrl;
    const key = `${asset.assetType || "IMAGE"}::${mediaIdentity}`;
    if (seenMedia.has(key)) return false;
    seenMedia.add(key);
    return true;
  });
}
