import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { downloadObject, getObjectPath, objectExists, objectPathFromReference, storageReference, uploadObject } from './supabaseStorage.js';
import { getAppUrl } from './appUrl.js';

const root = path.join(process.cwd(), 'uploads');
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/mp4']);
const maxBytes = 25 * 1024 * 1024;
const allowedProviderHosts = ['muapi.ai', 'kie.ai', 'redpandaai.co', 'cloudfront.net', 'amazonaws.com'];

function allowedProviderUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Provider returned an invalid media URL.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !allowedProviderHosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new Error('Provider media URL is not on the approved HTTPS host list.');
  }
  return url;
}

async function fetchProviderMedia(value, options) {
  let url = allowedProviderUrl(value);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetch(url, { signal: options.signal, redirect: 'manual', cache: 'no-store' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('Provider returned an invalid media redirect.');
    url = allowedProviderUrl(new URL(location, url).toString());
  }
  throw new Error('Provider returned too many media redirects.');
}

async function uploadVerified(objectPath, bytes, contentType) {
  await uploadObject(objectPath, bytes, { contentType, upsert: false });
  if (!(await objectExists(objectPath))) throw new Error('Uploaded media was not found during verification.');
  const stored = await downloadObject(objectPath);
  if (stored.length !== bytes.length || sha256(stored) !== sha256(bytes)) throw new Error('Uploaded media failed checksum verification.');
}

export async function storeBuffer(bytes, { workspaceId, projectId, resourceId, category, extension, contentType = 'application/octet-stream' } = {}) {
  const buffer = Buffer.from(bytes);
  const objectPath = getObjectPath({ workspaceId, projectId, resourceId, category, extension });
  await uploadVerified(objectPath, buffer, contentType);
  return storageReference(objectPath);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function storeLocalFile(file, namespace = 'references', { workspaceId, projectId, resourceId } = {}) {
  if (!file || !allowedTypes.has(file.type) || file.size > maxBytes) throw new Error('Unsupported file type or file is too large.');
  const extension = path.extname(file.name || '').toLowerCase() || (file.type === 'video/mp4' ? '.mp4' : '.bin');
  const category = namespace === 'references' ? 'references' : namespace;
  const objectPath = getObjectPath({ workspaceId, projectId, resourceId, category, extension });
  const bytes = Buffer.from(await file.arrayBuffer());
  await uploadVerified(objectPath, bytes, file.type);
  const reference = storageReference(objectPath);
  return { provider: 'supabase', key: reference, url: reference, storageUrl: reference, mimeType: file.type, fileName: path.basename(file.name), fileSize: bytes.length };
}

export async function loadLocalFile(stored) {
  const reference = stored?.storageUrl || stored?.key;
  const objectPath = objectPathFromReference(reference);
  if (objectPath) {
    const bytes = await downloadObject(objectPath);
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Stored reference image is missing or too large.');
    return new File([bytes], stored.fileName || path.basename(objectPath), { type: stored.mimeType || 'image/jpeg' });
  }
  const key = String(stored?.key || '');
  const target = path.resolve(root, key);
  if (!key || !target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid stored reference path.');
  const details = await stat(target);
  if (!details.isFile() || details.size > 10 * 1024 * 1024) throw new Error('Stored reference image is missing or too large.');
  const bytes = await readFile(target);
  return new File([bytes], stored.fileName || path.basename(target), { type: stored.mimeType || 'image/jpeg' });
}

function extensionFor(contentType, remoteUrl) {
  const pathname = (() => { try { return new URL(remoteUrl).pathname; } catch { return ''; } })();
  const remoteExtension = path.extname(pathname).toLowerCase();
  if (/^\.(mp4|mov|webm|mp3|wav|m4a|png|jpe?g|webp)$/.test(remoteExtension)) return remoteExtension;
  return ({ 'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/mp4': '.m4a', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' })[contentType] || '.bin';
}

export async function downloadRemoteToTempFile(remoteUrl, options = {}) {
  const parsed = allowedProviderUrl(remoteUrl);
  const response = await fetchProviderMedia(parsed.toString(), options);
  if (!response.ok) throw new Error(`Unable to download provider media (${response.status}).`);
  const maxDownloadBytes = Number(options.maxBytes || process.env.MAX_PROVIDER_DOWNLOAD_BYTES || 250 * 1024 * 1024);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > maxDownloadBytes) throw new Error('Provider media exceeds the configured download limit.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxDownloadBytes) throw new Error('Provider media exceeds the configured download limit.');
  const contentType = String(response.headers.get('content-type') || '').split(';')[0];
  const extension = extensionFor(contentType, parsed.href);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'creatora-media-'));
  const localPath = path.join(directory, `${randomUUID()}${extension}`);
  await writeFile(localPath, bytes);
  return { localPath, mimeType: contentType || 'application/octet-stream', fileSize: bytes.length, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

export async function createTemporaryFile(bytes, extension) {
  const safeExtension = /^\.[a-z0-9]{1,10}$/i.test(String(extension || "")) ? String(extension).toLowerCase() : ".bin";
  const directory = await mkdtemp(path.join(os.tmpdir(), "creatora-processing-"));
  const localPath = path.join(directory, `${randomUUID()}${safeExtension}`);
  try {
    await writeFile(localPath, Buffer.from(bytes));
    return { localPath, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function downloadAndStoreMedia(remoteUrl, category = 'images', options = {}) {
  const temporary = await downloadRemoteToTempFile(remoteUrl, options);
  try {
    const bytes = await readFile(temporary.localPath);
    const extension = path.extname(temporary.localPath).toLowerCase();
    const objectPath = getObjectPath({ workspaceId: options.workspaceId, projectId: options.projectId, resourceId: options.resourceId, category, extension });
    await uploadVerified(objectPath, bytes, temporary.mimeType);
    const reference = storageReference(objectPath);
    return { provider: 'supabase', key: reference, url: reference, storageUrl: reference, mimeType: temporary.mimeType, fileSize: bytes.length };
  } finally {
    if (typeof temporary.cleanup === 'function') await temporary.cleanup();
  }
}

export async function uploadLocalFile(localPath, { workspaceId, projectId, resourceId, category, contentType } = {}) {
  const bytes = await readFile(localPath);
  const extension = path.extname(localPath).toLowerCase();
  const objectPath = getObjectPath({ workspaceId, projectId, resourceId, category, extension });
  const fallbackType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' }[extension];
  await uploadVerified(objectPath, bytes, contentType || fallbackType || 'application/octet-stream');
  return storageReference(objectPath);
}

export function publicStorageUrl(storageUrl) {
  if (/^https?:\/\//i.test(storageUrl || '')) return storageUrl;
  return `${getAppUrl()}${storageUrl}`;
}

export function storageRoot() { return root; }
