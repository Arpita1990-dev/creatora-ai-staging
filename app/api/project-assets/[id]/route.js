import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrganization } from "@/lib/auth";
import { mediaUrlForWorkspace } from "@/lib/mediaDelivery";

const contentTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(request, { params }) {
  try {
    const { user } = await requireOrganization(request);
    const { id } = await params;
    const asset = await prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId, provider: "LOCAL_REFERENCE" },
    });
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    if (asset.outputUrl?.startsWith("supabase://")) {
      const signedUrl = await mediaUrlForWorkspace(asset.outputUrl, user.organizationId);
      return NextResponse.redirect(signedUrl, { status: 302, headers: { "Cache-Control": "private, no-store" } });
    }
    const storageRoot = resolve(process.cwd(), ".data", "project-assets");
    const matches = [".jpg", ".jpeg", ".png", ".webp"];
    for (const extension of matches) {
      try {
        const bytes = await readFile(resolve(storageRoot, `${id}${extension}`));
        return new Response(bytes, {
          headers: { "Content-Type": contentTypes[extension], "Cache-Control": "private, max-age=3600" },
        });
      } catch {}
    }
    return NextResponse.json({ error: "Asset file not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load asset." }, { status: 401 });
  }
}
