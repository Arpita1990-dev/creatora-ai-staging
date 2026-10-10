import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requireOrganization } from "@/lib/auth";
import {
  createGenerationJob,
  serializeGenerationJob,
} from "@/lib/generationJobs";
import { mediaUrlForWorkspace } from "@/lib/mediaDelivery";
import { promptFromVoiceBrief } from "@/lib/voiceVideo";
import { assertGenerationEntitlement, createProjectWithCapacity, workspaceEntitlements } from "@/lib/planCatalog";

export async function POST(request) {
  try {
    const { user } = await requireOrganization(request);
    checkRateLimit(`voice-video:${user.sub}`, 3, 5 * 60_000);
    const contentType = request.headers.get("content-type") || "";
    const form = contentType.includes("multipart/form-data") ? await request.formData() : null;
    const body = form
      ? {
          voiceInputId: form.get("voiceInputId"),
          projectId: form.get("projectId"),
          brief: JSON.parse(String(form.get("brief") || "{}")),
          duration: form.get("duration"),
          format: form.get("format"),
          settings: JSON.parse(String(form.get("settings") || "{}")),
          avatarConfig: JSON.parse(String(form.get("avatarConfig") || "null")),
          avatarReference: form.get("avatarReference"),
        }
      : await request.json();
    const entitlement = await workspaceEntitlements(prisma, user.organizationId);
    const generationKind = body.brief?.outputType === "AUDIO" ? "audio" : "video";
    const avatarVideo = Boolean(body.avatarConfig?.enabled);
    assertGenerationEntitlement(entitlement, { kind: generationKind, avatarVideo });
    const brief = body.brief;
    if (!brief?.title || !Array.isArray(brief.scenes) || !brief.scenes.length)
      return NextResponse.json(
        {
          error: "An approved media brief with at least one segment is required.",
        },
        { status: 400 },
      );
    const duration = Number(body.duration || brief.duration);
    if (![5, 10, 15, 30].includes(duration))
      return NextResponse.json(
        { error: "Duration must be 5, 10, 15, or 30 seconds." },
        { status: 400 },
      );
    const voiceInput = await prisma.voiceInput.findFirst({
      where: {
        id: String(body.voiceInputId || ""),
        userId: user.sub,
        organizationId: user.organizationId,
        status: "READY",
      },
    });
    if (!voiceInput)
      return NextResponse.json(
        { error: "Voice input was not found or is not ready." },
        { status: 404 },
      );
    const outputType = brief.outputType === "AUDIO" ? "AUDIO" : "VIDEO";
    const kind = outputType.toLowerCase();
    const prompt = promptFromVoiceBrief(
      { ...brief, duration },
      body.settings || {},
    );
    const project = body.projectId
      ? await prisma.project.findFirst({ where: { id: String(body.projectId), organizationId: user.organizationId } })
      : await createProjectWithCapacity(prisma, user.organizationId, {
          id: `voice_project_${crypto.randomUUID()}`,
          organizationId: user.organizationId,
          createdById: user.sub,
          name: brief.title,
          description: voiceInput.transcript,
          prompt,
          configuration: JSON.stringify({ source: "VOICE_TO_VIDEO", voiceInputId: voiceInput.id, avatar: body.avatarConfig?.enabled ? body.avatarConfig : null }),
          inputMethod: "VOICE",
          platform: brief.platform,
          aspectRatio: brief.aspectRatio,
          outputType,
          status: "IN_PROGRESS",
        });
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const campaign = await prisma.campaign.create({
      data: {
        id: `voice_campaign_${crypto.randomUUID()}`,
        organizationId: user.organizationId,
        projectId: project.id,
        createdById: user.sub,
        name: brief.title,
        productDescription: voiceInput.transcript,
        objective: `Voice to ${kind}`,
        platforms: JSON.stringify([brief.platform]),
        contentPlan: JSON.stringify(brief),
        status: "GENERATING",
      },
    });
    const generationJob = await createGenerationJob({
      campaignId: campaign.id,
      projectId: project.id,
      userId: user.sub,
      workspaceId: user.organizationId,
      kind,
      title: brief.title,
      prompt,
      platform: brief.platform,
      aspectRatio: body.format || brief.aspectRatio || "9:16",
      duration,
      voiceover: body.settings?.voiceover !== false,
      music: body.settings?.music !== false,
      applyBrandKit: body.applyBrandKit !== false,
      brandPurpose: body.avatarConfig?.enabled ? "AVATAR" : "VIDEO",
      avatarConfig: body.avatarConfig,
      referenceFile: body.avatarReference,
    });
    const serialized = serializeGenerationJob(generationJob);
    const job = await prisma.voiceVideoJob.create({
      data: {
        id: `voice_video_${crypto.randomUUID()}`,
        userId: user.sub,
        organizationId: user.organizationId,
        voiceInputId: voiceInput.id,
        campaignId: campaign.id,
        generationJobId: generationJob.id,
        briefJson: JSON.stringify({ ...brief, duration }),
        settingsJson: JSON.stringify({ ...(body.settings || {}), avatar: body.avatarConfig?.enabled ? body.avatarConfig : null }),
        provider: generationJob.provider,
        providerJobId: generationJob.providerJobId,
        status:
          serialized.status === "COMPLETED"
            ? "COMPLETED"
            : `GENERATING_${outputType}`,
        progress: serialized.status === "COMPLETED" ? 100 : 45,
        outputUrl: serialized.asset?.outputUrl || null,
        durationSeconds: duration,
        aspectRatio: body.format || brief.aspectRatio || "9:16",
        completedAt: serialized.status === "COMPLETED" ? new Date() : null,
      },
    });
    // Keep the selected media type queryable while briefJson remains the
    // canonical snapshot used by older in-flight jobs.
    await prisma.voiceVideoJob.update({
      where: { id: job.id },
      data: { outputType },
    });
    return NextResponse.json(
      {
        job: {
          id: job.id,
          assetId: generationJob.assetId,
          status: job.status,
          progress: job.progress,
          outputUrl: await mediaUrlForWorkspace(job.outputUrl, user.organizationId),
          outputType,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error.code === "PROJECT_LIMIT_REACHED") return NextResponse.json({ error: error.message, code: error.code, limit: error.limit, used: error.used }, { status: 403 });
    if (error.code === "UPGRADE_REQUIRED") return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error.code === "GENERATION_LIMIT_REACHED" || error.code === "PROJECT_LIMIT_REACHED") return NextResponse.json({ error: error.message, code: error.code, generationType: error.generationType, limit: error.limit, used: error.used }, { status: 403 });
    const status = /Authentication|Organization/.test(error.message)
      ? 401
      : /Too many/.test(error.message)
        ? 429
        : /required|must be/i.test(error.message)
          ? 400
          : 500;
    return NextResponse.json(
      { error: error.message || "Unable to create the voice video job." },
      { status },
    );
  }
}
