import { extname } from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requireOrganization } from "@/lib/auth";
import { interpretVoiceBrief, transcribeVoice } from "@/lib/voiceVideo";
import { storeBuffer } from "@/lib/storage";

const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
]);
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set([
  ".webm",
  ".wav",
  ".mp3",
  ".m4a",
  ".mp4",
  ".ogg",
]);

export async function POST(request) {
  let record;
  try {
    const { user } = await requireOrganization(request);
    checkRateLimit(`voice-input:${user.sub}`, 5, 60_000);
    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof File) || file.size === 0)
      return NextResponse.json(
        { error: "A voice recording is required." },
        { status: 400 },
      );
    // Browser recordings commonly include a codec parameter, such as
    // audio/webm;codecs=opus. Validate the base MIME type so microphone
    // recordings and uploaded files follow the same rules.
    const mimeType = String(file.type || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const suppliedExtension = extname(file.name || "").toLowerCase();
    const extensionFallbackAllowed =
      !mimeType || mimeType === "application/octet-stream";
    if (
      !AUDIO_TYPES.has(mimeType) &&
      !(extensionFallbackAllowed && AUDIO_EXTENSIONS.has(suppliedExtension))
    )
      return NextResponse.json(
        { error: "Use WebM, WAV, MP3, M4A, MP4, or OGG audio." },
        { status: 415 },
      );
    if (file.size > MAX_AUDIO_BYTES)
      return NextResponse.json(
        { error: "Voice recordings must be 25MB or smaller." },
        { status: 413 },
      );

    const id = `voice_${crypto.randomUUID()}`;
    const extension =
      suppliedExtension || (mimeType === "audio/webm" ? ".webm" : ".audio");
    const safeExtension = extension.replace(/[^.a-z0-9]/gi, "");
    const storageUrl = await storeBuffer(Buffer.from(await file.arrayBuffer()), { workspaceId: user.organizationId, category: "voice-inputs", resourceId: id, extension: safeExtension, contentType: mimeType || file.type || "application/octet-stream" });
    record = await prisma.voiceInput.create({
      data: {
        id,
        userId: user.sub,
        organizationId: user.organizationId,
        storageUrl,
        mimeType: mimeType || file.type || "application/octet-stream",
        sizeBytes: file.size,
        durationSeconds:
          Math.round(Number(form.get("recordingDuration") || 0)) || null,
        status: "TRANSCRIBING",
      },
    });
    const { transcript, language } = await transcribeVoice(file);
    await prisma.voiceInput.update({
      where: { id },
      data: { transcript, language, status: "UNDERSTANDING_PROMPT" },
    });
    const brief = await interpretVoiceBrief(transcript, {
      duration: Number(form.get("duration") || 15),
      aspectRatio: String(form.get("aspectRatio") || "9:16"),
      outputType: String(form.get("outputType") || "AUTO"),
    });
    record = await prisma.voiceInput.update({
      where: { id },
      data: { transcript, language, status: "READY" },
    });
    return NextResponse.json(
      {
        voiceInput: {
          id: record.id,
          transcript,
          language,
          status: record.status,
        },
        brief,
      },
      { status: 201 },
    );
  } catch (error) {
    if (record?.id)
      await prisma.voiceInput
        .update({
          where: { id: record.id },
          data: { status: "FAILED", errorMessage: error.message },
        })
        .catch(() => {});
    const status = /Authentication|Organization/.test(error.message)
      ? 401
      : /Too many/.test(error.message)
        ? 429
        : 500;
    return NextResponse.json(
      { error: error.message || "Unable to process voice input." },
      { status },
    );
  }
}
