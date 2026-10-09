import { prisma } from "./prisma.js";
import { assertSocialAccountCapacity, workspaceEntitlements } from "./planCatalog.js";

// A "destination" is a single publishable external account. SocialConnection
// keeps the encrypted OAuth authorization; one authorization can cover many
// destinations (several Facebook Pages, several YouTube channels), and each
// destination keeps its own stable provider id so it can be listed, selected
// while publishing and disconnected on its own.
export const DESTINATION_TYPES = Object.freeze({
  FACEBOOK_PAGE: "FACEBOOK_PAGE",
  INSTAGRAM_BUSINESS: "INSTAGRAM_BUSINESS",
  LINKEDIN_MEMBER: "LINKEDIN_MEMBER",
  LINKEDIN_ORGANIZATION: "LINKEDIN_ORGANIZATION",
  YOUTUBE_CHANNEL: "YOUTUBE_CHANNEL",
});

export const PROVIDER_PLATFORM = Object.freeze({
  META: "META",
  LINKEDIN: "LINKEDIN",
  YOUTUBE: "YOUTUBE",
});

const LIMIT_KEYS = Object.freeze({
  FACEBOOK_PAGE: "maxFacebookAccounts",
  INSTAGRAM_BUSINESS: "maxInstagramAccounts",
  LINKEDIN_MEMBER: "maxLinkedInAccounts",
  LINKEDIN_ORGANIZATION: "maxLinkedInAccounts",
  YOUTUBE_CHANNEL: "maxYouTubeAccounts",
});

export function platformForAccountType(accountType) {
  if (accountType === DESTINATION_TYPES.FACEBOOK_PAGE) return "FACEBOOK";
  if (accountType === DESTINATION_TYPES.INSTAGRAM_BUSINESS) return "INSTAGRAM";
  if (String(accountType || "").startsWith("LINKEDIN_")) return "LINKEDIN";
  if (accountType === DESTINATION_TYPES.YOUTUBE_CHANNEL) return "YOUTUBE";
  return null;
}

export function limitForAccountType(entitlement, accountType) {
  const key = LIMIT_KEYS[accountType];
  if (!key || !entitlement) return 0;
  return Number(entitlement[key] || 0);
}

export function limitForPlatform(entitlement, platform) {
  if (platform === "FACEBOOK") return Number(entitlement?.maxFacebookAccounts || 0);
  if (platform === "INSTAGRAM") return Number(entitlement?.maxInstagramAccounts || 0);
  if (platform === "LINKEDIN") return Number(entitlement?.maxLinkedInAccounts || 0);
  if (platform === "YOUTUBE") return Number(entitlement?.maxYouTubeAccounts || 0);
  return 0;
}

export function parseMetadata(connection) {
  try { return JSON.parse(connection?.metadata || "{}"); }
  catch { return {}; }
}

function facebookRecords(metadata) {
  const records = [];
  for (const page of metadata.pages || []) {
    if (!page?.id) continue;
    records.push({
      providerAccountId: String(page.id),
      accountType: DESTINATION_TYPES.FACEBOOK_PAGE,
      accountName: page.name || "Facebook Page",
      handle: null,
      thumbnail: page.picture || null,
    });
  }
  for (const account of metadata.instagramAccounts || []) {
    if (!account?.id) continue;
    records.push({
      providerAccountId: String(account.id),
      accountType: DESTINATION_TYPES.INSTAGRAM_BUSINESS,
      accountName: account.username ? `@${account.username}` : account.name || account.pageName || "Instagram",
      handle: account.username || null,
      thumbnail: account.picture || account.profilePictureUrl || null,
    });
  }
  return records;
}

function linkedinRecords(metadata) {
  return (metadata.destinations || [])
    .filter((item) => item?.id)
    .map((item) => ({
      providerAccountId: String(item.id),
      accountType: item.type === "ORGANIZATION" ? DESTINATION_TYPES.LINKEDIN_ORGANIZATION : DESTINATION_TYPES.LINKEDIN_MEMBER,
      accountName: item.name || (item.type === "ORGANIZATION" ? "LinkedIn organization" : "LinkedIn profile"),
      handle: null,
      thumbnail: item.picture || null,
    }));
}

function youtubeRecords(metadata) {
  return (metadata.channels || [])
    .filter((channel) => channel?.id)
    .map((channel) => ({
      providerAccountId: String(channel.id),
      accountType: DESTINATION_TYPES.YOUTUBE_CHANNEL,
      accountName: channel.title || "YouTube channel",
      handle: null,
      thumbnail: channel.thumbnail || null,
    }));
}

// Normalize whatever the provider discovery produced into destination rows.
// `authoritative` means "the provider told us the full current list", which
// allows pruning destinations that disappeared (page removed, channel
// unlinked). A partial or failed discovery must only add/refresh.
export function destinationRecordsFromMetadata(provider, metadata, { authoritative = false } = {}) {
  const builders = { META: facebookRecords, LINKEDIN: linkedinRecords, YOUTUBE: youtubeRecords };
  const build = builders[provider];
  if (!build) return { records: [], authoritative: false };
  const records = build(metadata);
  const discoveryFailed = Boolean(metadata.discovery?.error) || metadata.discovery?.status === "META_API_ERROR";
  return { records, authoritative: authoritative && !discoveryFailed && records.length > 0 };
}

export function destinationLabel(destination) {
  if (!destination) return "Account";
  return destination.handle ? `@${destination.handle}` : destination.accountName || "Account";
}

export function serializeDestination(destination, extra = {}) {
  const platform = platformForAccountType(destination.accountType);
  return {
    id: destination.id,
    connectionId: destination.socialConnectionId,
    provider: destination.provider,
    platform,
    accountType: destination.accountType,
    providerAccountId: destination.providerAccountId,
    accountName: destination.accountName,
    handle: destination.handle || null,
    label: destinationLabel(destination),
    thumbnail: destination.thumbnail || null,
    status: destination.status,
    connected: destination.status === "CONNECTED",
    updatedAt: destination.updatedAt,
    ...extra,
  };
}

function connectionWorkspaceFields(connection) {
  return { userId: connection.userId || null, organizationId: connection.organizationId || null };
}

// Sorts a workspace's destinations and flags the ones past the plan allowance so
// the UI can disable them and the publish route can refuse them, instead of the
// old behaviour of silently slicing the account list away.
export function annotatePlanLimits(destinations, entitlement) {
  const counters = new Map();
  return destinations.map((destination) => {
    const limit = limitForAccountType(entitlement, destination.accountType);
    const platform = platformForAccountType(destination.accountType);
    const used = counters.get(platform) || 0;
    if (destination.status === "CONNECTED") counters.set(platform, used + 1);
    const overLimit = destination.status === "CONNECTED" && used >= limit;
    return serializeDestination(destination, { limit, overLimit });
  });
}

export async function syncDestinations(connection, records, { authoritative = false } = {}) {
  const workspace = {
    userId: connection.userId || null,
    organizationId: connection.organizationId || null,
  };
  const organizationId = connection.organizationId || (await prisma.organization.findFirst({ where: { ownerId: connection.userId, accountType: "PERSONAL" }, select: { id: true } }))?.id;
  if (!organizationId) throw new Error("The billing workspace for this connection could not be resolved.");
  const entitlement = await workspaceEntitlements(prisma, organizationId);
  await prisma.$transaction(async (database) => {
  const existing = await database.socialDestination.findMany({ where: { ...workspace, status: "CONNECTED" } });
  const incoming = new Set(records.map((record) => `${record.accountType}:${record.providerAccountId}`));
  const retained = existing.filter((destination) => !authoritative || destination.socialConnectionId !== connection.id || incoming.has(`${destination.accountType}:${destination.providerAccountId}`));
  for (const platform of ["FACEBOOK", "INSTAGRAM", "LINKEDIN", "YOUTUBE"]) {
    const current = retained.filter((destination) => platformForAccountType(destination.accountType) === platform);
    const known = new Set(current.map((destination) => `${destination.accountType}:${destination.providerAccountId}`));
    const additions = new Set(records.filter((record) => platformForAccountType(record.accountType) === platform && !known.has(`${record.accountType}:${record.providerAccountId}`)).map((record) => `${record.accountType}:${record.providerAccountId}`));
    assertSocialAccountCapacity(entitlement, platform, current.length, additions.size);
  }
  const kept = [];
  for (const [index, record] of records.entries()) {
    const providerAccountId = String(record.providerAccountId);
    kept.push(providerAccountId);
    await database.socialDestination.upsert({
      where: { socialConnectionId_providerAccountId: { socialConnectionId: connection.id, providerAccountId } },
      create: {
        ...workspace,
        socialConnectionId: connection.id,
        provider: connection.provider,
        providerAccountId,
        accountType: record.accountType,
        accountName: record.accountName,
        handle: record.handle || null,
        thumbnail: record.thumbnail || null,
        status: "CONNECTED",
        position: index,
      },
      update: {
        accountType: record.accountType,
        accountName: record.accountName,
        handle: record.handle || null,
        thumbnail: record.thumbnail || null,
        status: "CONNECTED",
        position: index,
      },
    });
  }
  if (authoritative && kept.length) {
    await database.socialDestination.deleteMany({
      where: { socialConnectionId: connection.id, providerAccountId: { notIn: kept } },
    });
  }
  }, { isolationLevel: "Serializable" });
  return listDestinationsForConnection(connection.id);
}

export async function listDestinationsForConnection(connectionId) {
  return prisma.socialDestination.findMany({
    where: { socialConnectionId: connectionId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

// Workspace-level uniqueness guard: a Facebook Page / LinkedIn org / YouTube
// channel may only be connected once per workspace, even if two different
// authorizations can reach it.
export async function partitionNewDestinations(connection, records) {
  if (!records.length) return { records: [], duplicates: [] };
  const existing = await prisma.socialDestination.findMany({
    where: {
      ...connectionWorkspaceFields(connection),
      provider: connection.provider,
      providerAccountId: { in: records.map((record) => String(record.providerAccountId)) },
      socialConnectionId: { not: connection.id },
    },
    select: { providerAccountId: true, accountName: true },
  });
  const taken = new Set(existing.map((item) => item.providerAccountId));
  return {
    records: records.filter((record) => !taken.has(String(record.providerAccountId))),
    duplicates: existing,
  };
}

// Backfill for connections created before destinations existed. Reads only the
// stored metadata, so it never needs a decrypted token or a provider call.
export async function ensureDestinations(connection) {
  const existing = await prisma.socialDestination.count({ where: { socialConnectionId: connection.id } });
  if (existing) return listDestinationsForConnection(connection.id);
  const { records } = destinationRecordsFromMetadata(connection.provider, parseMetadata(connection));
  if (!records.length) return [];
  return syncDestinations(connection, records, { authoritative: false });
}

export async function listWorkspaceDestinations(where) {
  return prisma.socialDestination.findMany({
    where: { ...where, status: "CONNECTED" },
    orderBy: [{ provider: "asc" }, { position: "asc" }, { createdAt: "asc" }],
  });
}

export async function findDestinationById(where, id) {
  return prisma.socialDestination.findFirst({ where: { ...where, id } });
}

// Destinations are workspace-scoped rows, so the same external account can be
// connected to several Creatora workspaces without sharing a record.
export function destinationsBelongToWorkspace(destination, scope) {
  if (!destination) return false;
  if (scope.isOrganization) return Boolean(destination.organizationId) && destination.organizationId === scope.user.organizationId;
  return Boolean(destination.userId) && destination.userId === scope.user.sub && !destination.organizationId;
}