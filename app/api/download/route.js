import { NextResponse } from "next/server";

const ALLOWED_HOST_SUFFIXES = ["muapi.ai", "kie.ai", "redpandaai.co", "cloudfront.net", "amazonaws.com"];

function allowedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    if (
      !ALLOWED_HOST_SUFFIXES.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
      )
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function safeFilename(value, contentType) {
  const fallback = contentType.startsWith("video/")
    ? "creatora-video.mp4"
    : contentType.startsWith("audio/")
      ? "creatora-audio.mp3"
      : "creatora-asset";
  const clean =
    String(value || fallback)
      .replace(/[^a-zA-Z0-9._ -]/g, "")
      .trim()
      .slice(0, 120) || fallback;
  if (clean.includes(".")) return clean;
  return contentType.startsWith("video/")
    ? `${clean}.mp4`
    : contentType.startsWith("audio/")
      ? `${clean}.mp3`
      : `${clean}.png`;
}

async function fetchAllowed(url) {
  let current = url;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      cache: "no-store",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const next = allowedUrl(
      new URL(response.headers.get("location"), current).toString(),
    );
    if (!next)
      throw new Error(
        "The media provider redirected to an unsupported location.",
      );
    current = next;
  }
  throw new Error("The media provider returned too many redirects.");
}

export async function GET(request) {
  const source = allowedUrl(request.nextUrl.searchParams.get("url"));
  if (!source)
    return NextResponse.json(
      { error: "Unsupported download URL." },
      { status: 400 },
    );
  try {
    const upstream = await fetchAllowed(source);
    if (!upstream.ok || !upstream.body)
      return NextResponse.json(
        { error: `Unable to download media (${upstream.status}).` },
        { status: 502 },
      );
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const filename = safeFilename(
      request.nextUrl.searchParams.get("filename"),
      contentType,
    );
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...(upstream.headers.get("content-length")
          ? { "Content-Length": upstream.headers.get("content-length") }
          : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Download failed." },
      { status: 502 },
    );
  }
}
