import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import os from "node:os";
import { prisma } from "./prisma.js";
import { downloadObject, objectPathFromReference } from "./supabaseStorage.js";

const purposeFields = {
  IMAGE: ["brandName", "description", "brandColors", "targetAudience", "tone", "imageStyle"],
  VIDEO: ["brandName", "description", "brandColors", "targetAudience", "tone", "videoStyle", "callToAction"],
  AVATAR: ["brandName", "description", "targetAudience", "tone", "callToAction", "videoStyle"],
  AD: ["brandName", "description", "brandColors", "targetAudience", "tone", "imageStyle", "videoStyle", "callToAction"],
  CAMPAIGN: ["brandName", "description", "targetAudience", "tone", "callToAction", "imageStyle", "videoStyle"],
};
const contextMetadata = new Set(["brandKitId", "brandKitVersion", "purpose"]);

export function selectBrandContext(context, purpose) {
  const normalizedPurpose = String(purpose || "IMAGE").toUpperCase();
  const selected = new Set(purposeFields[normalizedPurpose] || purposeFields.IMAGE);
  const includeLogo = ["VIDEO", "AVATAR", "AD"].includes(normalizedPurpose);
  return Object.fromEntries(Object.entries(context).filter(([key]) =>
    contextMetadata.has(key) || selected.has(key) || (includeLogo && ["logoAssetId", "logoPlacement", "applyLogoToVideos"].includes(key)),
  ));
}

function parseRules(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

export async function buildBrandContext({ organizationId, userId, purpose }, database = prisma) {
  if (!organizationId || !userId) throw new Error("Organization access denied.");
  const [organization, membership] = await Promise.all([
    database.organization.findUnique({ where: { id: organizationId }, select: { accountType: true } }),
    database.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { status: true },
    }),
  ]);
  if (!organization || membership?.status !== "ACTIVE") throw new Error("Organization access denied.");
  if (organization.accountType !== "ORGANIZATION") return null;

  const record = await database.brandKit.findUnique({ where: { organizationId } });
  if (!record) return null;
  const rules = parseRules(record.additionalRules);
  const colors = Array.isArray(rules.brandColors)
    ? rules.brandColors
    : [record.primaryColor, record.secondaryColor, record.accentColor, record.backgroundColor].filter(Boolean);
  const normalizedPurpose = String(purpose || "IMAGE").toUpperCase();
  const context = {
    brandKitId: record.id,
    brandKitVersion: record.updatedAt?.toISOString?.() || null,
    purpose: normalizedPurpose,
    brandName: record.name || "",
    description: record.brandDescription || record.description || "",
    brandColors: colors.filter((color) => typeof color === "string" && color.trim()).slice(0, 8),
    targetAudience: record.targetAudience || "",
    tone: record.toneOfVoice || "",
    callToAction: record.defaultCallToAction || "",
    imageStyle: record.imageStyle || "",
    videoStyle: rules.videoStyle || "",
    logoAssetId: rules.applyLogoToVideos === false ? null : record.defaultLogoAssetId || null,
    logoPlacement: ["top-left", "top-right", "center", "bottom-left", "bottom-right"].includes(rules.logoPlacement)
      ? rules.logoPlacement
      : "bottom-right",
    applyLogoToVideos: rules.applyLogoToVideos !== false,
  };
  return selectBrandContext(context, normalizedPurpose);
}

export function buildBrandedPrompt(userPrompt, context) {
  const prompt = String(userPrompt || "").trim();
  if (!context) return prompt;
  const lines = [
    context.brandName && `Brand: ${context.brandName}`,
    context.description && `Brand description: ${context.description}`,
    context.targetAudience && `Target audience: ${context.targetAudience}`,
    context.tone && `Tone: ${context.tone}`,
    context.brandColors?.length && `Preferred brand colors: ${context.brandColors.join(", ")} (creative direction; exact color reproduction is not guaranteed)`,
    context.imageStyle && `Image style: ${context.imageStyle}`,
    context.videoStyle && `Video style: ${context.videoStyle}`,
    context.callToAction && `Preferred call to action: ${context.callToAction}`,
  ].filter(Boolean);
  return lines.length
    ? `${prompt}\n\nBrand context (apply where relevant; preserve the user's request as the primary intent):\n${lines.join("\n")}`
    : prompt;
}

export async function resolveBrandLogoPath(context, organizationId) {
  if (!context?.logoAssetId || !organizationId) return null;
  const asset = await prisma.asset.findFirst({
    where: { id: context.logoAssetId, organizationId, provider: "LOCAL_REFERENCE" },
    select: { id: true, outputUrl: true },
  });
  if (!asset) return null;
  const objectPath = objectPathFromReference(asset.outputUrl);
  if (objectPath) {
    if (!objectPath.startsWith(`workspaces/${organizationId}/`)) throw new Error("Brand Kit logo is outside the active workspace.");
    const extension = objectPath.slice(objectPath.lastIndexOf("."));
    if (!/^\.(jpg|jpeg|png|webp)$/i.test(extension)) throw new Error("Brand Kit logo format is unsupported.");
    const bytes = await downloadObject(objectPath);
    const directory = await mkdtemp(resolve(os.tmpdir(), "creatora-brand-logo-"));
    const filePath = resolve(directory, `${asset.id}${extension}`);
    try {
      await writeFile(filePath, bytes);
      return { path: filePath, cleanup: () => rm(directory, { recursive: true, force: true }) };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
  const root = resolve(process.cwd(), ".data", "project-assets");
  for (const extension of [".jpg", ".jpeg", ".png", ".webp"]) {
    const filePath = resolve(root, `${asset.id}${extension}`);
    try {
      await access(filePath);
      return { path: filePath, cleanup: async () => {} };
    } catch {}
  }
  return null;
}