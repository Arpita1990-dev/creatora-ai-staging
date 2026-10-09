import { NextResponse } from "next/server";

import {
  createGenerationJob,
  serializeGenerationJobForWorkspace,
} from "@/lib/generationJobs";
import { requireOrganization } from "@/lib/auth";
import { publicErrorMessage } from "@/lib/publicErrors";
import { prisma } from "@/lib/prisma";
import { assertGenerationEntitlement, workspaceEntitlements } from "@/lib/planCatalog";

export async function POST(request) {
  try {
    const { user, membership } = await requireOrganization(request);
    if (["VIEWER", "REVIEWER"].includes(membership.role))
      return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
    const formData = await request.formData();
    const requestedKind = String(formData.get("kind") || "image").toLowerCase();
    const kind = ["video", "audio"].includes(requestedKind)
      ? requestedKind
      : "image";
    const voiceoverConfigValue = formData.get("voiceoverConfig");
    let voiceoverConfig = null;
    try {
      voiceoverConfig = voiceoverConfigValue ? JSON.parse(String(voiceoverConfigValue)) : null;
    } catch {
      voiceoverConfig = null;
    }
    const avatarConfigValue = formData.get("avatarConfig");
    let avatarConfig = null;
    try {
      avatarConfig = avatarConfigValue ? JSON.parse(String(avatarConfigValue)) : null;
    } catch {
      avatarConfig = null;
    }
    const entitlement = await workspaceEntitlements(prisma, user.organizationId);
    assertGenerationEntitlement(entitlement, { kind, avatarVideo: Boolean(avatarConfig?.enabled) });
    if (kind === "image" && entitlement.imageGenerationLimit != null) {
      const generated = await prisma.generationJob.count({ where: { organizationId: user.organizationId, type: "IMAGE", status: { not: "FAILED" } } });
      if (generated >= entitlement.imageGenerationLimit) return NextResponse.json({ error: `The ${entitlement.plan.name} image generation limit has been reached. Upgrade to continue.` }, { status: 403 });
    }
    const job = await createGenerationJob({
      campaignId: String(formData.get("campaignId") || ""),
      projectId: String(formData.get("projectId") || ""),
      userId: user.sub,
      workspaceId: user.organizationId,
      kind,
      title: String(formData.get("title") || ""),
      prompt: String(formData.get("prompt") || ""),
      platform: String(formData.get("platform") || ""),
      aspectRatio: String(
        formData.get("aspectRatio") || (kind === "video" ? "9:16" : "1:1"),
      ),
      duration: Number(formData.get("duration") || 5),
      voiceover: formData.get("voiceover") !== "false",
      music: formData.get("music") !== "false",
      callToAction: String(formData.get("callToAction") || ""),
      applyBrandKit: formData.get("applyBrandKit") !== "false",
      brandPurpose: avatarConfig?.enabled ? "AVATAR" : kind === "video" ? "VIDEO" : kind === "audio" ? "AVATAR" : "IMAGE",
      voiceoverConfig,
      avatarConfig,
      referenceFile: formData.get("reference"),
    });
    return NextResponse.json(
      { job: await serializeGenerationJobForWorkspace(job, user.organizationId) },
      { status: 202 },
    );
  } catch (error) {
    if (error.code === "UPGRADE_REQUIRED") return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    const status = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || "")
      ? 401
      : /not found/i.test(error.message)
      ? 404
      : /required|must be/i.test(error.message)
        ? 400
        : 500;
    return NextResponse.json(
      { error: publicErrorMessage(error, "Unable to create generation job.") },
      { status },
    );
  }
}
