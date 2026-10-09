import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { MuApiVideoProvider } from "../lib/providers/muApiVideoProvider.js";
import { PROVIDER_TASK_STATUS } from "../lib/providers/videoProvider.js";

nextEnv.loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const provider = new MuApiVideoProvider();
const args = new Set(process.argv.slice(2));
const option = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
};
const force = args.has("--force");
const dryRun = args.has("--dry-run");
const showStatus = args.has("--status");
const slug = option("slug");
const limit = Number(option("limit") || 0);
const pollInterval = Math.max(1000, Number(process.env.TEMPLATE_PREVIEW_POLL_INTERVAL_MS || 5000));
const timeout = Math.max(60000, Number(process.env.TEMPLATE_PREVIEW_TIMEOUT_MS || 20 * 60_000));

function parseConfiguration(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function mediaKind(configuration) {
  if (configuration.video) return "video";
  if (configuration.audio) return "audio";
  return null;
}

function durationSeconds(value, kind) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (kind === "video") return [5, 10, 15, 30].includes(parsed) ? parsed : 10;
  return [5, 8, 10, 12, 15, 20, 30].includes(parsed) ? parsed : 15;
}

function isFatalAccountError(error) {
  return /api key|credential|unauthorized|forbidden|insufficient|not enough|balance|credits/i.test(String(error?.message || error || ""));
}

function localReferenceFile(url, slug) {
  const publicDir = join(process.cwd(), "public");
  const candidates = [
    ...(url?.startsWith("/") ? [join(publicDir, url.replace(/^\/+/, ""))] : []),
    ...["jpg", "png", "webp"].map((extension) =>
      join(publicDir, "template-thumbnails", `${slug}.${extension}`),
    ),
  ];
  const path = candidates.find(existsSync);
  if (!path) {
    if (url?.startsWith("/")) throw new Error(`Thumbnail file not found: ${candidates[0]}`);
    return null;
  }
  const extension = extname(path).toLowerCase();
  const type = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return new File([readFileSync(path)], `template-reference${extension || ".jpg"}`, { type });
}

async function waitForResult(taskId, kind) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    const result = await provider.getTaskStatus(taskId, kind);
    if (result.status === PROVIDER_TASK_STATUS.SUCCEEDED) return result;
    if (result.status === PROVIDER_TASK_STATUS.FAILED) throw new Error(result.error || "MuAPI generation failed.");
  }
  throw new Error(`MuAPI generation timed out after ${Math.round(timeout / 60000)} minutes.`);
}

async function generatePreview(template, configuration, kind) {
  const referenceFile = kind === "video" ? localReferenceFile(template.thumbnailUrl, template.slug) : null;
  const referenceUrl = kind === "video" && !referenceFile ? template.thumbnailUrl : null;
  const spokenScript = template.slug === "gallery-preview"
    ? "Step into a space where every artwork has a story. Discover new perspectives, meet the artists, and experience the exhibition in person. Plan your visit today."
    : "";
  const audioDirection = kind === "video"
    ? ` Treat the supplied thumbnail as the source of truth and preserve its recognizable subject, setting, colors, and important details. Create genuine, subject-specific cinematic motion with distinct visual beats, not just a still-image pan or zoom. Add a warm, clear professional English voiceover${spokenScript ? ` speaking exactly: \"${spokenScript}\"` : ` with a concise script about ${template.name}, ending with the call to action \"${template.cta || "Learn More"}\"`}. Mix in subtle, original instrumental music suited to the subject beneath the narration, with no lyrics or recognizable melodies. Keep narration intelligible; no unrelated dialogue or sound effects.`
    : "";
  const submission = await provider.createVideoTask({
    kind,
    prompt: `${template.promptTemplate || template.description || `Create a polished ${kind} for ${template.name}.`}${audioDirection}`,
    aspectRatio: template.aspectRatio || "9:16",
    duration: durationSeconds(configuration.duration, kind),
    referenceFile,
    referenceUrl,
    idempotencyKey: `template:${template.slug}:${kind}:muapi:voiceover-v3`,
  });
  return submission.url ? submission : waitForResult(submission.taskId, kind);
}

async function main() {
  if (!provider.isAvailable()) throw new Error("MUAPI_API_KEY is not configured.");
  const templates = await prisma.template.findMany({
    where: { isPublished: true, ...(slug ? { slug } : {}) },
    orderBy: { slug: "asc" },
  });
  const candidates = templates
    .map((template) => ({ template, configuration: parseConfiguration(template.configuration) }))
    .map((item) => ({ ...item, kind: mediaKind(item.configuration) }))
    .filter((item) => item.kind && (force || item.configuration.previewProvider !== "MUAPI"));
  const selected = limit > 0 ? candidates.slice(0, limit) : candidates;
  if (showStatus) {
    const generated = templates.filter((template) => parseConfiguration(template.configuration).previewProvider === "MUAPI");
    const uniqueUrls = new Set(generated.map((template) => template.previewUrl).filter(Boolean));
    console.log(JSON.stringify({
      mediaTemplates: templates.filter((template) => mediaKind(parseConfiguration(template.configuration))).length,
      generated: generated.length,
      pending: candidates.length,
      uniquePreviewUrls: uniqueUrls.size,
      records: generated.map((template) => ({ slug: template.slug, thumbnailUrl: template.thumbnailUrl, previewUrl: template.previewUrl })),
    }, null, 2));
    return;
  }
  console.log(`${dryRun ? "Would generate" : "Generating"} ${selected.length} of ${candidates.length} pending media previews.`);
  if (dryRun) {
    selected.forEach(({ template, kind }) => console.log(`${kind}: ${template.slug}`));
    return;
  }

  let completed = 0;
  const failures = [];
  for (const { template, configuration, kind } of selected) {
    process.stdout.write(`[${completed + failures.length + 1}/${selected.length}] ${template.slug} (${kind})... `);
    try {
      const result = await generatePreview(template, configuration, kind);
      const nextConfiguration = {
        ...configuration,
        previewKind: kind === "video" ? "full-motion" : configuration.previewKind,
        previewProvider: "MUAPI",
        previewModel: result.model || null,
        previewGeneratedAt: new Date().toISOString(),
        previewReferenceUrl: kind === "video" ? template.thumbnailUrl : null,
      };
      await prisma.template.update({
        where: { id: template.id },
        data: { previewUrl: result.url, configuration: JSON.stringify(nextConfiguration) },
      });
      completed += 1;
      console.log("saved");
    } catch (error) {
      failures.push({ slug: template.slug, error: error.message || String(error) });
      console.log(`failed: ${error.message || error}`);
      if (isFatalAccountError(error)) {
        console.log("Stopping because MuAPI credentials or credits require attention.");
        break;
      }
    }
  }
  console.log(JSON.stringify({ completed, failed: failures.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());