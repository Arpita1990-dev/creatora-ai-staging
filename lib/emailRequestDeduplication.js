import 'server-only';
import { createHash } from 'node:crypto';

const requests = new Map();
const replayWindowMs = 60_000;

export async function deduplicateEmailRequest(action, body, operation) {
  const normalized = { ...body, email: String(body.email || '').trim().toLowerCase() };
  const fingerprint = createHash('sha256').update(JSON.stringify(normalized, Object.keys(normalized).sort())).digest('hex');
  const key = `${action}:${fingerprint}`;
  const now = Date.now();
  for (const [entryKey, entry] of requests) {
    if (entry.expiresAt <= now) requests.delete(entryKey);
  }
  const existing = requests.get(key);
  if (existing) return (await existing.promise).clone();
  if (requests.size >= 1000) return operation();

  const entry = { expiresAt: Infinity, promise: null };
  entry.promise = Promise.resolve().then(operation).then(async (response) => {
    const result = await response.clone().json().catch(() => ({}));
    if (!response.ok || result.emailSent === false) requests.delete(key);
    else entry.expiresAt = Date.now() + replayWindowMs;
    return response;
  }).catch((error) => { requests.delete(key); throw error; });
  requests.set(key, entry);
  return (await entry.promise).clone();
}