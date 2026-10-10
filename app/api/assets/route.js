import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { prisma } from "@/lib/prisma";
import { createAssetRecord } from "@/lib/assetRepository";
import { generatedAssetLibraryWhere } from "@/lib/assetWorkspaceScope";
import { currentRefreshToken, hashToken } from "@/lib/auth";
import { mediaUrlForWorkspace } from "@/lib/mediaDelivery";
import { downloadAndStoreMedia } from "@/lib/storage";
import { downloadObject, objectPathFromReference } from "@/lib/supabaseStorage";
import { requireOrganization } from "@/lib/auth";
import { permanentlyDeleteAssets } from "@/lib/permanentDeletion";

function parsePlatforms(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value || "")
      .split(",")
      .map((platform) => platform.trim())
      .filter(Boolean);
  }
}

async function referenceFingerprint(asset) {
  if (asset.provider !== "LOCAL_REFERENCE" || !/^reference_[\da-f-]+$/i.test(asset.id)) return null;
  const objectPath = objectPathFromReference(asset.outputUrl);
  if (objectPath) {
    const bytes = await downloadObject(objectPath);
    return createHash("sha256").update(bytes).digest("hex");
  }
  if (asset.outputUrl?.startsWith("supabase://")) return null;
  const storageRoot = resolve(process.cwd(), ".data", "project-assets");
  for (const extension of [".jpg", ".png", ".webp"]) {
    try {
      const bytes = await readFile(resolve(storageRoot, `${asset.id}${extension}`));
      return createHash("sha256").update(bytes).digest("hex");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function currentUserId() {
  const token = await currentRefreshToken();
  if (!token) return "local-user";
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date())
    return "local-user";
  return session.userId;
}

export async function GET(request) {
  try {
    const { user } = await requireOrganization(request);
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { accountType: true },
    });
    if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    const records = await prisma.asset.findMany({
      where: generatedAssetLibraryWhere({ accountType: organization.accountType, organizationId: user.organizationId, userId: user.sub }),
      orderBy: { createdAt: "desc" },
    });
    const assets = await Promise.all(records.map(async ({ provider, providerJobId, providerStatus, ...asset }) => ({
      ...asset,
      outputUrl: await mediaUrlForWorkspace(asset.outputUrl, user.organizationId),
      thumbnailUrl: await mediaUrlForWorkspace(asset.thumbnailUrl, user.organizationId),
      contentFingerprint: await referenceFingerprint({ ...asset, provider }),
      status: asset.outputUrl && asset.completedAt && ["QUEUED", "PROCESSING"].includes(asset.status)
        ? "COMPLETED"
        : asset.status,
      platforms: parsePlatforms(asset.platforms),
    })));
    return NextResponse.json({ assets, count: records.length });
  } catch (error) {
    const authenticationError = /auth|token|jwt|organization access/i.test(error.message || "");
    return NextResponse.json({
      assets: [],
      error: authenticationError ? "Authentication required." : "Unable to load assets.",
    }, { status: authenticationError ? 401 : 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.url && !/^https?:\/\//i.test(body.url))
      return NextResponse.json(
        { error: "A valid asset URL is required." },
        { status: 400 },
      );
    const { user } = await requireOrganization(request);
    const userId = user.sub;
    const organization = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { accountType: true } });
    if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (body.id) {
      const existing = await prisma.asset.findUnique({ where: { id: String(body.id) }, select: { userId: true, organizationId: true } });
      if (existing && (organization.accountType === "ORGANIZATION"
        ? existing.organizationId !== user.organizationId
        : existing.userId !== userId || (existing.organizationId !== null && existing.organizationId !== user.organizationId))) {
        return NextResponse.json({ error: "Asset not found." }, { status: 404 });
      }
    }
    if (body.projectId && !await prisma.project.findFirst({ where: { id: body.projectId, organizationId: user.organizationId }, select: { id: true } })) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const assetId = String(body.id || crypto.randomUUID());
    const assetCategory = body.type === "Video" ? "videos" : body.type === "Audio" ? "audio" : "images";
    const output = body.url
      ? await downloadAndStoreMedia(body.url, assetCategory, { workspaceId: user.organizationId, projectId: body.projectId || null, resourceId: assetId })
      : null;
    const thumbnail = body.thumbnailUrl
      ? await downloadAndStoreMedia(body.thumbnailUrl, "images", { workspaceId: user.organizationId, projectId: body.projectId || null, resourceId: `${assetId}-thumbnail` })
      : null;
    const asset = await createAssetRecord({
      assetId,
      userId,
      organizationId: organization.accountType === "ORGANIZATION" ? user.organizationId : null,
      projectId: body.projectId || null,
      campaignId: body.campaignId || null,
      title: String(body.name || "Generated asset").slice(0, 200),
      type:
        body.type === "Video"
          ? "VIDEO"
          : body.type === "Audio"
            ? "AUDIO"
            : "IMAGE",
      status: body.status || "COMPLETED",
      prompt: String(body.prompt || "").slice(0, 5000) || null,
      platform: body.platform,
      aspectRatio: body.aspectRatio || body.format,
      duration: body.duration,
      provider: "CLIENT_IMPORT",
      providerJobId: null,
      outputUrl: output?.url || null,
      thumbnailUrl: thumbnail?.url || output?.url || null,
      completedAt: body.status === "QUEUED" ? null : new Date(),
    });
    const { provider, providerJobId, providerStatus, ...publicAsset } = asset;
    return NextResponse.json({ asset: {
      ...publicAsset,
      outputUrl: await mediaUrlForWorkspace(publicAsset.outputUrl, user.organizationId),
      thumbnailUrl: await mediaUrlForWorkspace(publicAsset.thumbnailUrl, user.organizationId),
    } }, { status: 201 });
  } catch (error) {
    const authenticationError = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || "");
    return NextResponse.json(
      { error: error.message || "Unable to save the generated asset." },
      { status: authenticationError ? 401 : 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { user, membership } = await requireOrganization(request);
    if (["VIEWER", "REVIEWER"].includes(membership.role))
      return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Asset ID is required." }, { status: 400 });
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { accountType: true },
    });
    if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ...assetWorkspaceWhere({
          accountType: organization.accountType,
          organizationId: user.organizationId,
          userId: user.sub,
        }),
      },
    });
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await permanentlyDeleteAssets(prisma, [asset]);
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    const authenticationError = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || "");
    return NextResponse.json(
      { error: error.message || "Unable to delete asset." },
      { status: authenticationError ? 401 : 500 },
    );
  }
}
