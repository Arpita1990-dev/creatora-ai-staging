import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishFacebook, publishInstagram } from "@/lib/metaPublishing";
import { publishLinkedIn } from "@/lib/linkedinPublishing";
import { publishYouTube } from "@/lib/youtubePublishing";
import { workspaceEntitlements } from "@/lib/planCatalog";
import { canPublishToWorkspace } from "@/lib/organizationPermissions";
import { safeSocialError } from "@/lib/socialErrorSanitizer";
import {
  annotatePlanLimits,
  ensureDestinations,
  platformForAccountType,
} from "@/lib/socialDestinations";

const PLATFORMS = new Set(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "YOUTUBE"]);

const LEGACY_TARGET_KEYS = Object.freeze({
  FACEBOOK: "pageId",
  INSTAGRAM: "instagramAccountId",
  LINKEDIN: "linkedinDestinationId",
  YOUTUBE: "youtubeChannelId",
});

async function scopedContext(request) {
  const { user, membership } = await requireOrganization(request);
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, accountType: true, ownerId: true },
  });
  const isOrganization = organization?.accountType === "ORGANIZATION";
  return { user, membership, organization, isOrganization, organizationId: isOrganization ? user.organizationId : null };
}

function serialize(job) {
  return {
    id: job.id,
    assetId: job.assetId,
    platform: job.platform,
    connectionId: job.connectionId || null,
    destinationId: job.destinationId || null,
    destinationName: job.destinationName || null,
    caption: job.caption || "",
    status: job.status,
    platformPostId: job.platformPostId,
    platformPostUrl: job.platformPostUrl,
    errorMessage: job.errorMessage,
    createdBy: job.createdBy,
    createdAt: job.createdAt,
    publishedAt: job.publishedAt,
  };
}

export async function GET(request) {
  try {
    const context = await scopedContext(request);
    // Personal owners and organization content editors may publish. This is the
    // same rule the pre-multi-account route used, now resolved centrally.
    if (!canPublishToWorkspace({ organization: context.organization, membership: context.membership, userId: context.user.sub })) {
      return NextResponse.json({ error: "Your workspace role does not allow publishing." }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const where = context.isOrganization ? { organizationId: context.organizationId } : { userId: context.user.sub, organizationId: null };
    if (searchParams.get("status")) where.status = searchParams.get("status");
    const jobs = await prisma.publishJob.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ jobs: jobs.map(serialize) });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load publish jobs." }, { status: 401 });
  }
}

// Accepts the multi-destination payload ({ destinations: [{ id }] }) and the
// legacy single-destination payload ({ platforms, pageId, ... }) so existing
// clients keep working.
function requestedTargets(body) {
  if (Array.isArray(body.destinations) && body.destinations.length) {
    return body.destinations
      .map((item) => {
        if (typeof item === "string") return { destinationId: item, platform: null };
        return { destinationId: String(item.destinationId || item.id || ""), platform: item.platform ? String(item.platform).toUpperCase() : null };
      })
      .filter((item) => item.destinationId);
  }
  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.map((platform) => String(platform || "").toUpperCase()).filter((platform) => PLATFORMS.has(platform)))]
    : [];
  return platforms
    .map((platform) => ({ platform, providerAccountId: String(body[LEGACY_TARGET_KEYS[platform]] || "") }))
    .filter((item) => item.providerAccountId);
}

async function resolveTargets(scope, targets, entitlement) {
  const connections = await prisma.socialConnection.findMany({ where: { ...scope, status: "CONNECTED" } });
  for (const connection of connections) await ensureDestinations(connection);
  const rows = await prisma.socialDestination.findMany({
    where: { ...scope, status: "CONNECTED", ...(connections.length ? { socialConnectionId: { in: connections.map((item) => item.id) } } : {}) },
    include: { connection: true },
  });
  const connectionsById = new Map(connections.map((item) => [item.id, item]));
  const all = annotatePlanLimits(rows, entitlement).map((destination) => ({
    ...destination,
    connection: connectionsById.get(destination.connectionId),
  }));
  const resolved = [];
  const seen = new Set();
  for (const target of targets) {
    const destination = target.destinationId
      ? all.find((item) => item.id === target.destinationId)
      : all.find((item) => item.provider === (target.platform === "FACEBOOK" || target.platform === "INSTAGRAM" ? "META" : target.platform) && String(item.providerAccountId) === target.providerAccountId);
    if (!destination) {
      return { error: "One of the selected destinations is no longer connected to this workspace.", status: 400 };
    }
    if (seen.has(destination.id)) continue;
    seen.add(destination.id);
    if (target.platform && destination.platform !== target.platform) {
      return { error: "One of the selected destinations does not match its platform.", status: 400 };
    }
    if (!destination.connection?.accessTokenEncrypted) {
      return { error: `${destination.accountName} needs to be reconnected before publishing.`, status: 409 };
    }
    if (destination.overLimit) {
      return { error: `${destination.accountName} is beyond your plan's account limit. Upgrade or disconnect another account.`, status: 403 };
    }
    resolved.push(destination);
  }
  return { resolved };
}

export async function POST(request) {
  try {
    const context = await scopedContext(request);
    if (!canPublishToWorkspace({ organization: context.organization, membership: context.membership, userId: context.user.sub })) {
      return NextResponse.json({ error: "Your workspace role does not allow publishing." }, { status: 403 });
    }
    const entitlement = await workspaceEntitlements(prisma, context.user.organizationId);
    const body = await request.json();
    const assetId = String(body.assetId || "");
    if (!assetId) return NextResponse.json({ error: "assetId is required." }, { status: 400 });
    const targets = requestedTargets(body);
    if (!targets.length) return NextResponse.json({ error: "Select at least one connected social destination." }, { status: 400 });

    const platforms = new Set(targets.map((target) => target.platform).filter(Boolean));
    if (platforms.has("FACEBOOK") && !entitlement.maxFacebookAccounts) return NextResponse.json({ error: "Facebook publishing requires Creator, Pro, or Business." }, { status: 403 });
    if (platforms.has("INSTAGRAM") && !entitlement.maxInstagramAccounts) return NextResponse.json({ error: "Instagram publishing requires Creator, Pro, or Business." }, { status: 403 });
    if (platforms.has("LINKEDIN") && !entitlement.maxLinkedInAccounts) return NextResponse.json({ error: "LinkedIn publishing requires a paid plan." }, { status: 403 });
    if (platforms.has("YOUTUBE") && !entitlement.maxYouTubeAccounts) return NextResponse.json({ error: "YouTube publishing requires a paid plan." }, { status: 403 });

    const scope = context.isOrganization ? { organizationId: context.organizationId } : { userId: context.user.sub, organizationId: null };
    const assetWhere = context.isOrganization
      ? { id: assetId, organizationId: context.organizationId }
      : { id: assetId, userId: context.user.sub, OR: [{ organizationId: context.user.organizationId }, { organizationId: null }] };
    const asset = await prisma.asset.findFirst({ where: assetWhere });
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    if (!asset.outputUrl || !["IMAGE", "VIDEO"].includes(asset.assetType)) return NextResponse.json({ error: "Only completed image or video assets can be published." }, { status: 409 });

    let publishAsset = { ...asset, storageWorkspaceId: context.user.organizationId };
    if (asset.outputUrl.startsWith("/")) {
      const generationJob = await prisma.generationJob.findFirst({ where: { assetId: asset.id, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { responsePayload: true } });
      try {
        const providerSourceUrl = JSON.parse(generationJob?.responsePayload || "{}").providerSourceUrl;
        if (/^https:\/\//i.test(providerSourceUrl || "")) publishAsset = { ...asset, outputUrl: providerSourceUrl };
      } catch {}
    }

    const { resolved, error, status } = await resolveTargets(scope, targets, entitlement);
    if (error) return NextResponse.json({ error }, { status: status || 400 });

    const caption = String(body.caption || "").slice(0, 2200);
    const youtubePrivacy = ["private", "unlisted", "public"].includes(body.youtubePrivacy) ? body.youtubePrivacy : "private";
    const youtubeTitle = String(body.youtubeTitle || asset.title || "CreateoraAI video").slice(0, 100);
    const youtubeDescription = String(body.youtubeDescription || body.caption || "").slice(0, 5000);

    // One job per destination, so a failure on LinkedIn never marks Facebook or
    // YouTube as failed.
    const jobs = await prisma.$transaction(
      resolved.map((destination) =>
        prisma.publishJob.create({
          data: {
            userId: context.user.sub,
            organizationId: context.organizationId,
            assetId,
            platform: platformForAccountType(destination.accountType) || "FACEBOOK",
            connectionId: destination.connectionId,
            destinationId: destination.id,
            destinationName: destination.label,
            caption: caption || null,
            status: "PROCESSING",
            createdBy: context.user.sub,
          },
        })
      )
    );

    const results = [];
    for (const [index, job] of jobs.entries()) {
      const destination = resolved[index];
      try {
        const connection = destination.connection;
        let published;
        if (job.platform === "FACEBOOK") published = await publishFacebook({ request, connection, asset: publishAsset, caption, pageId: destination.providerAccountId });
        else if (job.platform === "INSTAGRAM") published = await publishInstagram({ request, connection, asset: publishAsset, caption, instagramAccountId: destination.providerAccountId });
        else if (job.platform === "LINKEDIN") published = await publishLinkedIn({ request, connection, asset: publishAsset, caption, destinationId: destination.providerAccountId });
        else {
          if (asset.assetType !== "VIDEO") throw new Error("YouTube publishing requires a video asset.");
          published = await publishYouTube({
            request,
            connection,
            asset: publishAsset,
            title: youtubeTitle,
            description: youtubeDescription,
            privacyStatus: youtubePrivacy,
            channelId: destination.providerAccountId,
            onRefresh: (data) => prisma.socialConnection.update({ where: { id: connection.id }, data }),
          });
        }
        results.push(await prisma.publishJob.update({ where: { id: job.id }, data: { status: "PUBLISHED", platformPostId: published.id || null, platformPostUrl: published.url || null, publishedAt: new Date() } }));
      } catch (error) {
        results.push(await prisma.publishJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: safeSocialError(error, "Publishing failed.") } }));
      }
    }
    return NextResponse.json({ jobs: results.map(serialize) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to publish this asset." }, { status: 400 });
  }
}
