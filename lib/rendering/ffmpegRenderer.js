import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const dimensions = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] };

function filterText(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/%/g, '\\%').replace(/,/g, '\\,');
}

function filterPath(value) {
  return String(value).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export async function resolveDrawtextFont() {
  const candidates = [
    process.env.FFMPEG_FONT_PATH,
    ...(process.platform === 'win32' ? ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf'] : []),
    ...(process.platform === 'darwin' ? ['/System/Library/Fonts/Supplemental/Arial.ttf'] : []),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('No font is available for video text overlays. Install DejaVu Sans or set FFMPEG_FONT_PATH.');
}

export function callToActionFilter({ inputLabel, text, fontFile, brandColor, fontSize, start }) {
  const color = /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : '#111111';
  return `[${inputLabel}]drawbox=x=0:y=ih*0.78:w=iw:h=ih*0.22:color=${color}@0.92:t=fill:enable='gte(t,${start})',drawtext=fontfile='${filterPath(fontFile)}':text='${filterText(text)}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=h*0.86-text_h/2:enable='gte(t,${start})'[cta]`;
}

export function logoOverlayPosition(placement) {
  const margin = 48;
  const positions = {
    'top-left': `${margin}:${margin}`,
    'top-right': `W-w-${margin}:${margin}`,
    'bottom-left': `${margin}:H-h-${margin}`,
    'bottom-right': `W-w-${margin}:H-h-${margin}`,
    center: '(W-w)/2:(H-h)/2',
  };
  return positions[placement] || positions['bottom-right'];
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12000); });
    child.once('error', (error) => reject(new Error(`Unable to start FFmpeg: ${error.message}`)));
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${stderr.slice(-2000)}`)));
  });
}

export class FfmpegRenderer {
  constructor(options = {}) { this.binary = options.binary || process.env.FFMPEG_PATH || ffmpegInstaller.path || 'ffmpeg'; }

  async render({ inputPath, inputPaths, aspectRatio = '9:16', duration, voiceoverPath, musicPath, logoPath, logoPlacement = 'bottom-right', captionsPath, callToAction, brandColor = '#111111' }) {
    const [width, height] = dimensions[aspectRatio] || dimensions['9:16'];
    const scenes = (inputPaths?.length ? inputPaths : [inputPath]).filter(Boolean);
    if (!scenes.length) throw new Error('At least one source video is required.');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'creatora-ffmpeg-'));
    const basename = randomUUID();
    const outputPath = path.join(directory, `${basename}.mp4`);
    const thumbnailPath = path.join(directory, `${basename}.jpg`);
    const args = ['-y'];
    scenes.forEach((scene) => args.push('-i', scene));
    const voiceIndex = voiceoverPath ? scenes.length : null;
    const musicIndex = musicPath ? scenes.length + Number(Boolean(voiceoverPath)) : null;
    const logoIndex = logoPath ? scenes.length + Number(Boolean(voiceoverPath)) + Number(Boolean(musicPath)) : null;
    if (voiceoverPath) args.push('-i', voiceoverPath);
    if (musicPath) args.push('-i', musicPath);
    if (logoPath) args.push('-i', logoPath);
    const filters = scenes.map((_, index) => `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,setpts=PTS-STARTPTS[v${index}]`);
    if (scenes.length > 1) filters.push(`${scenes.map((_, index) => `[v${index}]`).join('')}concat=n=${scenes.length}:v=1:a=0[base]`);
    else filters.push('[v0]null[base]');
    let videoLabel = 'base';
    if (captionsPath) {
      filters.push(`[${videoLabel}]subtitles=filename='${filterPath(captionsPath)}'[captioned]`);
      videoLabel = 'captioned';
    }
    if (logoPath) {
      filters.push(`[${logoIndex}:v]scale=${Math.round(width * .18)}:-1[logo]`);
      filters.push(`[${videoLabel}][logo]overlay=${logoOverlayPosition(logoPlacement)}[branded]`);
      videoLabel = 'branded';
    }
    if (callToAction && duration) {
      const start = Math.max(0, Number(duration) - 2.5);
      const fontFile = await resolveDrawtextFont();
      filters.push(callToActionFilter({ inputLabel: videoLabel, text: callToAction, fontFile, brandColor, fontSize: Math.round(width * .055), start }));
      videoLabel = 'cta';
    }
    filters.push(`[${videoLabel}]null[video]`);
    const audioInputs = [];
    if (voiceoverPath) audioInputs.push(`[${voiceIndex}:a]volume=1.0[voice]`);
    if (musicPath) audioInputs.push(`[${musicIndex}:a]volume=0.18[music]`);
    filters.push(...audioInputs);
    if (voiceoverPath && musicPath) filters.push('[voice][music]amix=inputs=2:duration=longest[audio]');
    const complex = filters.join(';');
    args.push('-filter_complex', complex, '-map', '[video]');
    if (voiceoverPath && musicPath) args.push('-map', '[audio]');
    else if (voiceoverPath) args.push('-map', '[voice]');
    else if (musicPath) args.push('-map', '[music]');
    else if (scenes.length === 1) args.push('-map', '0:a?');
    if (duration) args.push('-t', String(duration));
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath);
    try {
      await run(this.binary, args);
      await run(this.binary, ['-y', '-ss', '0.5', '-i', outputPath, '-frames:v', '1', '-vf', `scale=${Math.min(width, 720)}:-2`, thumbnailPath]);
      return { outputPath, thumbnailPath, cleanup: () => rm(directory, { recursive: true, force: true }) };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}

export const ffmpegRenderer = new FfmpegRenderer();
