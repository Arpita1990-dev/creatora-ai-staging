import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ffmpegPath = join(
  process.cwd(),
  "node_modules",
  "@ffmpeg-installer",
  "win32-x64",
  "ffmpeg.exe",
);
const sourceDir = join(process.cwd(), ".data", "template-stock-sources");
const outputDir = join(process.cwd(), "public", "template-stock");
const musicPath = join(sourceDir, "background-music.mp3");

const clips = {
  animals: 22732,
  automotive: 35540,
  beauty: 40556,
  business: 308,
  events: 14116,
  fashion: 44556,
  food: 49231,
  home: 25001,
  sports: 43483,
  technology: 46635,
  travel: 41576,
  wellness: 2213,
};

async function download(url, destination) {
  if (existsSync(destination)) return;
  await execFileAsync("curl.exe", [
    "-fL",
    "--retry", "3",
    "--max-time", "120",
    "-A", "Mozilla/5.0",
    "-o", destination,
    url,
  ]);
}

async function main() {
  if (!existsSync(ffmpegPath)) throw new Error("FFmpeg is not installed.");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  await download(
    "https://download.samplelib.com/mp3/sample-12s.mp3",
    musicPath,
  );

  for (const [category, id] of Object.entries(clips)) {
    const sourcePath = join(sourceDir, `${category}.mp4`);
    const outputPath = join(outputDir, `${category}.mp4`);
    await download(
      `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`,
      sourcePath,
    );
    await execFileAsync(ffmpegPath, [
      "-stream_loop", "-1",
      "-i", sourcePath,
      "-stream_loop", "-1",
      "-i", musicPath,
      "-t", "10",
      "-vf",
      "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=30,format=yuv420p",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "24",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);
    console.log(`created ${category}: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
