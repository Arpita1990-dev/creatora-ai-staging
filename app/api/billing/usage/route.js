import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrganization } from "@/lib/auth";

export async function GET(request) {
  try {
    const { user } = await requireOrganization(request);
    const jobs = await prisma.generationJob.findMany({
      where: {
        organizationId: user.organizationId,
        type: { in: ["IMAGE", "VIDEO"] },
        status: "COMPLETED",
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        assetId: true,
        type: true,
        chargedCredits: true,
        createdAt: true,
        completedAt: true,
      },
    });
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: jobs.map((job) => job.assetId).filter(Boolean) },
        organizationId: user.organizationId,
      },
      select: { id: true, title: true },
    });
    const titleByAssetId = new Map(assets.map((asset) => [asset.id, asset.title]));

    return NextResponse.json({
      usage: jobs.map((job) => ({
        id: job.id,
        type: job.type,
        title: titleByAssetId.get(job.assetId) || `${job.type === "VIDEO" ? "Video" : "Image"} generation`,
        credits: job.chargedCredits,
        completedAt: job.completedAt || job.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load credit history." }, { status: 401 });
  }
}