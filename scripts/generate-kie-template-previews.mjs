import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { KieVideoProvider } from "../lib/providers/kieVideoProvider.js";
import { PROVIDER_TASK_STATUS } from "../lib/providers/videoProvider.js";

nextEnv.loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const provider = new KieVideoProvider();
const outputDir = path.join(process.cwd(), "public", "template-ai");
const stateDir = path.join(process.cwd(), ".data");
const statePath = path.join(stateDir, "kie-template-previews.json");
const concurrency = Math.max(1, Number(process.env.KIE_TEMPLATE_CONCURRENCY || 3));
const limit = Math.max(0, Number(process.env.KIE_TEMPLATE_LIMIT || 0));
const creditsPerVideo = 40;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")); }
  catch { return { templates: {} }; }
}

function writeState(state) {
  const temporary = `${statePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, statePath);
}

function configuration(record) {
  try { return JSON.parse(record.configuration || "{}"); }
  catch { return {}; }
}

function thumbnailPath(record) {
  const candidates = [];
  if (record.thumbnailUrl?.startsWith("/")) {
    candidates.push(path.join(process.cwd(), "public", record.thumbnailUrl.replace(/^\/+/, "")));
  }
  for (const extension of ["jpg", "jpeg", "png", "webp"]) {
    candidates.push(path.join(process.cwd(), "public", "template-thumbnails", `${record.slug}.${extension}`));
  }
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function publicPath(filePath) {
  return `/${path.relative(path.join(process.cwd(), "public"), filePath).replaceAll("\\", "/")}`;
}

function voiceLine(record, config) {
  const cta = String(config.cta || "Discover more").replace(/[.!]+$/, "");
  return `${record.name}. ${cta}.`;
}

function generationPrompt(record, config) {
  return [
    `Create a polished five-second ${record.platform || "social media"} campaign video for ${record.name}.`,
    "Animate Image1 as the exact first frame. Keep its subject, product, people, colors, setting, and composition recognizable throughout.",
    record.promptTemplate || record.description || `Use subtle realistic motion for ${record.category || "this campaign"}.`,
    "Use smooth cinematic camera movement and natural subject motion. No morphing, replacement subjects, random text, logos, captions, beeps, test tones, or sine-wave sounds.",
    `Audio: a warm professional English narrator clearly says, "${voiceLine(record, config)}" Add tasteful ${config.style || "modern"} instrumental background music mixed quietly beneath the narration.`,
  ].join(" ");
}

function kieAspectRatio(aspectRatio) {
  return new Set(["16:9", "9:16", "1:1"]).has(aspectRatio) ? aspectRatio : "adaptive";
}

async function accountBalance() {
  const response = await fetch("https://api.kie.ai/api/v1/chat/credit", {
    headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}` },
  });
  const body = await response.json();
  if (!response.ok || Number(body.code) !== 200) throw new Error(body.msg || "Unable to read Kie balance.");
  return Number(body.data);
}

async function uploadThumbnail(record, entry) {
  if (entry.referenceUrl) return entry.referenceUrl;
  const localPath = thumbnailPath(record);
  if (!localPath) throw new Error(`No local thumbnail for ${record.slug}`);
  const extension = path.extname(localPath).toLowerCase();
  const type = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  entry.thumbnailUrl = publicPath(localPath);
  const file = new File([fs.readFileSync(localPath)], path.basename(localPath), { type });
  entry.referenceUrl = await provider.uploadReferenceFile(file);
  return entry.referenceUrl;
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 50_000) throw new Error(`Generated video is unexpectedly small (${buffer.length} bytes)`);
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, buffer);
  fs.renameSync(temporary, destination);
  return buffer.length;
}

async function persistResult(record, entry, result) {
  const destination = path.join(outputDir, `${record.slug}.mp4`);
  const bytes = await download(result.url, destination);
  const config = configuration(record);
  Object.assign(config, {
    previewKind: "ai-generated",
    previewProvider: "KIE",
    previewModel: entry.model,
    previewGeneratedAt: new Date().toISOString(),
    previewReferenceUrl: entry.thumbnailUrl,
    previewCredits: result.cost,
    previewHasVoiceover: true,
    previewHasMusic: true,
  });
  await prisma.template.update({
    where: { id: record.id },
    data: {
      thumbnailUrl: entry.thumbnailUrl,
      previewUrl: `/template-ai/${record.slug}.mp4`,
      configuration: JSON.stringify(config),
    },
  });
  Object.assign(entry, {
    status: "complete",
    bytes,
    completedAt: new Date().toISOString(),
    cost: result.cost,
  });
}

async function processRecord(record, state) {
  const entry = state.templates[record.slug] ||= {};
  const destination = path.join(outputDir, `${record.slug}.mp4`);
  if (entry.status === "complete" && fs.existsSync(destination)) return;
  try {
    if (!entry.taskId) {
      const referenceUrl = await uploadThumbnail(record, entry);
      writeState(state);
      const created = await provider.createVideoTask({
        kind: "video",
        prompt: generationPrompt(record, configuration(record)),
        referenceUrl,
        duration: 5,
        aspectRatio: kieAspectRatio(record.aspectRatio),
        resolution: "480P",
        voiceover: true,
        music: true,
        idempotencyKey: `template:${record.slug}:kie:wan3:v1`,
      });
      Object.assign(entry, {
        taskId: created.taskId,
        model: created.model,
        status: "queued",
        submittedAt: new Date().toISOString(),
      });
      writeState(state);
      console.log(`[submitted] ${record.slug} ${created.taskId}`);
    }
    while (true) {
      const result = await provider.getTaskStatus(entry.taskId);
      Object.assign(entry, {
        status: result.status,
        progress: result.progress,
        checkedAt: new Date().toISOString(),
      });
      writeState(state);
      if (result.status === PROVIDER_TASK_STATUS.SUCCEEDED) {
        if (!result.url) throw new Error("Kie succeeded without a downloadable URL.");
        await persistResult(record, entry, result);
        writeState(state);
        console.log(`[complete] ${record.slug} ${(entry.bytes / 1_000_000).toFixed(1)} MB`);
        return;
      }
      if (result.status === PROVIDER_TASK_STATUS.FAILED) {
        throw new Error(result.error || "Kie generation failed.");
      }
      await delay(15_000);
    }
  } catch (error) {
    entry.status = "failed";
    entry.error = error?.message || String(error);
    entry.failedAt = new Date().toISOString();
    writeState(state);
    console.error(`[failed] ${record.slug}: ${entry.error}`);
  }
}

async function main() {
  if (!provider.isAvailable()) throw new Error("KIE_API_KEY is not configured.");
  const records = await prisma.template.findMany({
    where: { isPublished: true },
    orderBy: { slug: "asc" },
  });
  let targets = records.filter((record) => {
    const config = configuration(record);
    return config.video === true &&
      config.previewKind !== "full-motion" &&
      config.previewKind !== "ai-generated";
  });
  if (limit) targets = targets.slice(0, limit);
  const state = readState();
  const balance = await accountBalance();
  const requestedCount = targets.length;
  const fundedCount = Math.min(requestedCount, Math.floor(balance / creditsPerVideo));
  targets = targets.slice(0, fundedCount);
  console.log(`[start] ${requestedCount} targets, balance ${balance}, funded ${fundedCount}, concurrency ${concurrency}`);
  if (!targets.length && requestedCount) {
    console.error(`[blocked] Need at least ${creditsPerVideo} Kie credits for the next video; ${balance} remain.`);
    process.exitCode = 2;
    return;
  }
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    while (cursor < targets.length) {
      const record = targets[cursor++];
      await processRecord(record, state);
    }
  });
  await Promise.all(workers);
  const failed = targets.filter((record) => state.templates[record.slug]?.status !== "complete");
  console.log(`[summary] complete=${targets.length - failed.length} failed=${failed.length}`);
  if (requestedCount > fundedCount) {
    console.log(`[balance] ${requestedCount - fundedCount} templates remain unfunded.`);
    process.exitCode = 2;
  }
  if (failed.length) {
    console.log(`[retry] ${failed.map((record) => record.slug).join(", ")}`);
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
