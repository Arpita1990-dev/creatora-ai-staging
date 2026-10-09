import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ffmpegPath = join(process.cwd(), "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe");
const sourceDir = join(process.cwd(), ".data", "landing-showcase-sources");
const outputDir = join(process.cwd(), "public", "landing", "showcase");

// Mixkit free-license clip IDs (https://mixkit.co/license/#videoFree)
const clips = {
  "jewellery-reveal": 51649,
  "running-shoe": 15059,
  "latte-art": 810,
  "skincare-routine": 50426,
  "streetwear-shoot": 403,
  "creator-tutorial": 50417,
  "basketball-training": 746,
  "tech-workspace": 1730,
  "cafe-social": 4919,
};

async function download(id, destination) {
  if (existsSync(destination)) return;
  for (const quality of ["720", "360"]) {
    try {
      await execFileAsync("curl.exe", ["-fL", "--retry", "3", "--max-time", "180", "-A", "Mozilla/5.0", "-o", destination, `https://assets.mixkit.co/videos/${id}/${id}-${quality}.mp4`]);
      return;
    } catch {}
  }
  throw new Error(`Could not download clip ${id}`);
}

async function main() {
  if (!existsSync(ffmpegPath)) throw new Error("FFmpeg is not installed.");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  for (const [name, id] of Object.entries(clips)) {
    const sourcePath = join(sourceDir, `${name}.mp4`);
    await download(id, sourcePath);
    await execFileAsync(ffmpegPath, [
      "-i", sourcePath, "-t", "10", "-an",
      "-vf", "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-movflags", "+faststart",
      "-y", join(outputDir, `${name}.mp4`),
    ]);
    await execFileAsync(ffmpegPath, [
      "-ss", "1", "-i", sourcePath, "-frames:v", "1",
      "-vf", "scale=540:960:force_original_aspect_ratio=increase,crop=540:960",
      "-q:v", "4", "-y", join(outputDir, `${name}-poster.jpg`),
    ]);
    console.log(`created ${name}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
