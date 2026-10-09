import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

async function ensureTemplates() {
  const count = await prisma.template.count({ where: { isPublished: true } });
  if (count > 0) return;
  await execFileAsync(process.execPath, ["prisma/seedTemplates.mjs"], {
    cwd: process.cwd(),
    timeout: 30_000,
    windowsHide: true,
  });
}

function serialize(record) {
  let configuration = {};
  try {
    configuration = JSON.parse(record.configuration || "{}");
  } catch {}
  const isAudioTemplate =
    configuration.audio === true ||
    /audio/i.test(String(configuration.type || "")) ||
    /audio/i.test(String(configuration.outputType || "")) ||
    /audio/i.test(String(record.assetType || "")) ||
    /^audio$/i.test(String(record.aspectRatio || ""));
  if (isAudioTemplate) return null;
  const isMediaTemplate = configuration.video || configuration.audio;
  const isVideoPreview = /\.(mp4|webm|mov|m3u8)(?:\?|$)/i.test(
    record.previewUrl || "",
  );
  const isApprovedPreview =
    configuration.previewKind === "full-motion" ||
    (configuration.previewKind === "ai-generated" &&
      configuration.previewProvider === "KIE" &&
      configuration.previewReferenceUrl === record.thumbnailUrl) ||
    (configuration.previewProvider === "MUAPI" &&
      configuration.previewReferenceUrl === record.thumbnailUrl);
  let previewUrl = !isMediaTemplate ? record.previewUrl : null;
  if (isMediaTemplate && isVideoPreview && isApprovedPreview) {
    previewUrl = record.previewUrl;
  }
  if (/^\/template-(previews|stock|ai)\//.test(previewUrl || "")) {
    const previewPath = join(process.cwd(), "public", previewUrl.replace(/^\/+/, ""));
    previewUrl = existsSync(previewPath)
      ? `${previewUrl}?v=${Math.trunc(statSync(previewPath).mtimeMs)}`
      : null;
  }
  return {
    ...configuration,
    id: record.slug,
    name: record.name,
    image: record.thumbnailUrl,
    previewUrl,
    description: record.description || "",
    category: record.category || "Other",
    industry: record.industry || "General",
    platform: record.platform || "Website",
    format: record.aspectRatio || "1:1",
    prompt: record.promptTemplate || "",
    previewUrl,
  };
}

export async function GET(request) {
  try {
    await ensureTemplates();
    const slug = request.nextUrl.searchParams.get("slug");
    if (slug) {
      const record = await prisma.template.findFirst({
        where: { slug, isPublished: true },
      });
      const template = record ? serialize(record) : null;
      return template
        ? NextResponse.json({ template })
        : NextResponse.json({ error: "Template not found." }, { status: 404 });
    }
    const page = Math.max(
      1,
      Number.parseInt(request.nextUrl.searchParams.get("page") || "1", 10),
    );
    const pageSize = Math.min(
      48,
      Math.max(
        1,
        Number.parseInt(
          request.nextUrl.searchParams.get("pageSize") || "12",
          10,
        ),
      ),
    );
    const category = request.nextUrl.searchParams.get("category");
    const platform = request.nextUrl.searchParams.get("platform");
    const output = request.nextUrl.searchParams.get("output");
    const campaign = request.nextUrl.searchParams.get("campaign");
    const published = await prisma.template.findMany({
      where: { isPublished: true },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    });
    const serialized = published.map(serialize).filter(Boolean);
    const filtered = serialized.filter(
      (item) =>
        (!category || category === "All" || item.category === category) &&
        (!platform || platform === "All" || item.platform === platform) &&
        (!output || output === "All" || item.type === output) &&
        (!campaign || campaign === "All" || item.campaignType === campaign),
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;
    return NextResponse.json({
      templates: filtered.slice(offset, offset + pageSize),
      pagination: {
        page: currentPage,
        pageSize,
        total: filtered.length,
        totalPages,
      },
      facets: {
        category: [...new Set(serialized.map((item) => item.category))].sort(),
        platform: [...new Set(serialized.map((item) => item.platform))].sort(),
        output: [...new Set(serialized.map((item) => item.type))].sort(),
        campaign: [
          ...new Set(serialized.map((item) => item.campaignType)),
        ].sort(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to load templates." },
      { status: 500 },
    );
  }
}
