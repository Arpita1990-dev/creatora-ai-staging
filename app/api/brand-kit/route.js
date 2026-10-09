import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { canManageBrandKit } from "@/lib/brandKitPermissions";
import { mediaUrlForWorkspace } from "@/lib/mediaDelivery";
import { prisma } from "@/lib/prisma";

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || "{}"); } catch { return fallback; }
}

async function requireOrganizationAccount(request) {
  const context = await requireOrganization(request);
  const organization = await prisma.organization.findUnique({ where: { id: context.user.organizationId } });
  if (organization?.accountType !== "ORGANIZATION") throw new Error("Brand Kit is available only for organization workspaces.");
  return context;
}

function serialize(record) {
  if (!record) return null;
  const additionalRules = safeJson(record.additionalRules);
  const brandColors = Array.isArray(additionalRules.brandColors)
    ? additionalRules.brandColors
    : [record.primaryColor, record.secondaryColor, record.accentColor, record.backgroundColor].filter(Boolean);
  return {
    id: record.id,
    brandName: record.name,
    description: record.brandDescription || record.description || "",
    primaryColor: record.primaryColor || "#ff5a36",
    secondaryColor: record.secondaryColor || "#101011",
    voice: record.toneOfVoice || "",
    targetAudience: record.targetAudience || "",
    logoName: record.primaryLogoName || "",
    defaultCallToAction: record.defaultCallToAction || "",
    brandColors,
    imageStyle: record.imageStyle || "",
    videoStyle: additionalRules.videoStyle || "",
    logoPlacement: additionalRules.logoPlacement || "bottom-right",
    applyLogoToImages: additionalRules.applyLogoToImages ?? true,
    applyLogoToVideos: additionalRules.applyLogoToVideos ?? true,
  };
}

export async function GET(request) {
  try {
    const { user, membership } = await requireOrganizationAccount(request);
    const record = await prisma.brandKit.findUnique({
      where: { organizationId: user.organizationId },
    });
    const [primaryLogo, secondaryLogo] = await Promise.all([
      record?.defaultLogoAssetId ? prisma.asset.findFirst({ where: { id: record.defaultLogoAssetId, organizationId: user.organizationId }, select: { outputUrl: true } }) : null,
      record?.secondaryLogoAssetId ? prisma.asset.findFirst({ where: { id: record.secondaryLogoAssetId, organizationId: user.organizationId }, select: { outputUrl: true } }) : null,
    ]);
    const brandKit = serialize(record);
    if (brandKit) {
      brandKit.logoUrl = await mediaUrlForWorkspace(primaryLogo?.outputUrl || null, user.organizationId);
      brandKit.secondaryLogoUrl = await mediaUrlForWorkspace(secondaryLogo?.outputUrl || null, user.organizationId);
    }
    return NextResponse.json({ brandKit, canManage: canManageBrandKit(membership) });
  } catch (error) {
    console.error("[brand-kit GET] error:", error);
    const message = error instanceof Error ? error.message : "Unable to load brand kit.";
    return NextResponse.json({ error: message }, { status: message.includes("workspace") ? 403 : 401 });
  }
}

export async function PUT(request) {
  try {
    const { user, membership } = await requireOrganizationAccount(request);
    if (!canManageBrandKit(membership)) return NextResponse.json({ error: "Only organization owners and admins can modify the Brand Kit." }, { status: 403 });
    const body = await request.json();
    const brandColors = Array.isArray(body.brandColors)
      ? body.brandColors.map((color) => String(color || "").trim()).filter(Boolean).slice(0, 8)
      : [body.primaryColor, body.secondaryColor].filter(Boolean);
    const primaryColor = brandColors[0] || body.primaryColor || null;
    const secondaryColor = brandColors[1] || body.secondaryColor || null;
    const accentColor = brandColors[2] || body.accentColor || null;
    const backgroundColor = brandColors[3] || body.backgroundColor || null;
    const additionalRules = {
      brandColors,
      videoStyle: String(body.videoStyle || "").slice(0, 1000),
      logoPlacement: ["top-left", "top-right", "center", "bottom-left", "bottom-right"].includes(body.logoPlacement)
        ? body.logoPlacement
        : "bottom-right",
      applyLogoToImages: body.applyLogoToImages !== false,
      applyLogoToVideos: body.applyLogoToVideos !== false,
    };
    // MVP Brand Kit keeps only 8 fields; legacy columns (fonts, compliance,
    // etc.) are left untouched instead of being nulled out on every save.
    const data = {
      name: String(body.brandName || "Untitled brand").slice(0, 200),
      description: String(body.description || "").slice(0, 5000) || null,
      brandDescription: String(body.description || "").slice(0, 5000) || null,
      primaryColor,
      secondaryColor,
      accentColor,
      backgroundColor,
      toneOfVoice: String(body.voice || "").slice(0, 1000) || null,
      targetAudience: String(body.targetAudience || "").slice(0, 2000) || null,
      primaryLogoName: String(body.logoName || "").slice(0, 255) || null,
      defaultCallToAction: String(body.defaultCallToAction || "").slice(0, 500) || null,
      imageStyle: String(body.imageStyle || "").slice(0, 1000) || null,
      additionalRules: JSON.stringify(additionalRules),
    };
    const record = await prisma.brandKit.upsert({
      where: { organizationId: user.organizationId },
      update: data,
      create: { organizationId: user.organizationId, ...data },
    });
    return NextResponse.json({ brandKit: serialize(record) });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to save brand kit." }, { status: 400 });
  }
}
