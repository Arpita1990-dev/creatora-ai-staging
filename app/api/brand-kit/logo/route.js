import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { canManageBrandKit } from "@/lib/brandKitPermissions";
import { createAssetRecord } from "@/lib/assetRepository";
import { mediaUrlForWorkspace } from "@/lib/mediaDelivery";
import { prisma } from "@/lib/prisma";
import { storeBuffer } from "@/lib/storage";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request) {
  try {
    const { user, membership } = await requireOrganization(request);
    if (!canManageBrandKit(membership)) return NextResponse.json({ error: "Only organization owners and admins can upload logos." }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    const slot = form.get("slot") === "secondary" ? "secondary" : "primary";
    if (!(file instanceof File) || !file.size || !allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: "Use a PNG, JPG, or WebP logo up to 10MB." }, { status: 415 });
    const id = `brand_logo_${crypto.randomUUID()}`;
    const extension = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
    const reference = await storeBuffer(Buffer.from(await file.arrayBuffer()), { workspaceId: user.organizationId, category: "brand-kit", resourceId: id, extension, contentType: file.type });
    await createAssetRecord({ assetId: id, userId: user.sub, organizationId: user.organizationId, title: file.name, type: "IMAGE", status: "COMPLETED", provider: "LOCAL_REFERENCE", outputUrl: reference, thumbnailUrl: reference, completedAt: new Date() });
    await prisma.brandKit.update({
      where: { organizationId: user.organizationId },
      data: slot === "secondary" ? { secondaryLogoAssetId: id, secondaryLogoName: file.name } : { defaultLogoAssetId: id, primaryLogoName: file.name },
    });
    return NextResponse.json({ assetId: id, name: file.name, slot, url: await mediaUrlForWorkspace(reference, user.organizationId) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to upload logo." }, { status: 400 });
  }
}
