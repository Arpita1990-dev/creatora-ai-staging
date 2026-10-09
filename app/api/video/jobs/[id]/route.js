import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrganization } from "@/lib/auth";
import { mediaUrlForWorkspace } from "@/lib/mediaDelivery";
import {
  serializeGenerationJob,
  serializeGenerationJobForWorkspace,
  syncGenerationJob,
} from "@/lib/generationJobs";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export async function GET(request, { params }) {
  try {
    const { user } = await requireOrganization(request);
    const { id } = await params;
    let voiceJob = await prisma.voiceVideoJob.findFirst({
      where: { id, userId: user.sub, organizationId: user.organizationId },
    });
    if (!voiceJob)
      return NextResponse.json(
        { error: "Voice media job not found." },
        { status: 404 },
      );
    let outputType = "VIDEO";
    try {
      outputType =
        JSON.parse(voiceJob.briefJson)?.outputType === "AUDIO"
          ? "AUDIO"
          : "VIDEO";
    } catch {}
    let generationJob = await prisma.generationJob.findUnique({
      where: { id: voiceJob.generationJobId },
    });
    if (!generationJob) {
      const errorMessage = "The generation job is no longer available. Please generate the voice video again.";
      await prisma.voiceVideoJob.update({
        where: { id },
        data: { status: "FAILED", progress: 100, errorMessage, completedAt: new Date() },
      });
      return NextResponse.json({ job: { id, status: "FAILED", progress: 100, error: errorMessage, outputUrl: null, outputType, duration: voiceJob.durationSeconds, aspectRatio: voiceJob.aspectRatio } });
    }
    // Keep voice jobs moving even when the optional background worker is not
    // running (for example during local development or a single-process
    // deployment). Provider submission/finalization is already protected by
    // database claims, so concurrent browser polls cannot submit twice.
    if (!TERMINAL_STATUSES.has(generationJob.status)) {
      generationJob = await syncGenerationJob(generationJob);
    }
    const serialized = serializeGenerationJob(generationJob);
    const completed = serialized.status === "COMPLETED";
    const failed = serialized.status === "FAILED";
    const stableOutputUrl = serialized.asset?.outputUrl || voiceJob.outputUrl;
    voiceJob = await prisma.voiceVideoJob.update({
      where: { id },
      data: {
        status: completed
          ? "COMPLETED"
          : failed
            ? "FAILED"
            : `GENERATING_${outputType}`,
        progress:
          completed || failed
            ? 100
            : Math.max(voiceJob.progress, serialized.progress ?? 0),
        errorMessage: serialized.error || null,
        outputUrl: stableOutputUrl,
        providerJobId: generationJob.providerJobId || voiceJob.providerJobId,
        completedAt: completed || failed ? new Date() : null,
      },
    });
    return NextResponse.json(
      {
        job: {
          id: voiceJob.id,
          assetId: serialized.assetId,
          status: voiceJob.status,
          progress: voiceJob.progress,
          error: voiceJob.errorMessage,
          outputUrl: await mediaUrlForWorkspace(voiceJob.outputUrl, user.organizationId),
          outputType,
          duration: voiceJob.durationSeconds,
          aspectRatio: voiceJob.aspectRatio,
        },
      },
      {
        status: completed || failed ? 200 : 202,
        headers: { "Retry-After": "3" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to load the voice video job." },
      { status: /Authentication|Organization/.test(error.message) ? 401 : 500 },
    );
  }
}
