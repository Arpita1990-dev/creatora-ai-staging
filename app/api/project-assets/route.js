import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { createAssetRecord } from "@/lib/assetRepository";
import { mediaUrlForWorkspace } from "@/lib/mediaDelivery";
import { prisma } from "@/lib/prisma";
import { storeBuffer } from "@/lib/storage";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;

export async function POST(request) {
  try {
    const { user } = await requireOrganization(request);
    const form = await request.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") || "");
    const campaignId = String(form.get("campaignId") || "") || null;
    if (!(file instanceof File) || !file.size)
      return NextResponse.json({ error: "A reference image is required." }, { status: 400 });
    if (!allowedTypes.has(file.type) || file.size > maxBytes)
      return NextResponse.json({ error: "Use a PNG, JPG, or WebP image up to 10MB." }, { status: 415 });
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
    });
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const id = `reference_${crypto.randomUUID()}`;
    const extension = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
    const reference = await storeBuffer(Buffer.from(await file.arrayBuffer()), { workspaceId: user.organizationId, projectId, resourceId: id, category: "references", extension, contentType: file.type });
    const asset = await createAssetRecord({
      assetId: id,
      userId: user.sub,
      organizationId: user.organizationId,
      projectId,
      campaignId,
      title: file.name,
      type: "IMAGE",
      status: "COMPLETED",
      provider: "LOCAL_REFERENCE",
      outputUrl: reference,
      thumbnailUrl: reference,
      completedAt: new Date(),
    });
    const { provider, providerJobId, providerStatus, ...publicAsset } = asset;
    return NextResponse.json({ asset: { ...publicAsset, outputUrl: await mediaUrlForWorkspace(publicAsset.outputUrl, user.organizationId), thumbnailUrl: await mediaUrlForWorkspace(publicAsset.thumbnailUrl, user.organizationId) } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to save the reference asset." }, { status: 400 });
  }
}
