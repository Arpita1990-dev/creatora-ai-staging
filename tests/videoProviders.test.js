import test from 'node:test';
import assert from 'node:assert/strict';

import { KieVideoProvider } from '../lib/providers/kieVideoProvider.js';
import { ProviderRouter } from '../lib/providers/providerRouter.js';
import { MuApiVideoProvider } from '../lib/providers/muApiVideoProvider.js';
import { fallbackEligible, skipPrimaryRetry, serializeGenerationJob } from '../lib/generationJobs.js';
import { pollMuapiGeneration, submitMuapiGeneration } from '../lib/muapiGeneration.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('KieVideoProvider creates a task with a backend bearer token and idempotency key', async () => {
  let request;
  const provider = new KieVideoProvider({ apiKey: 'secret', fetch: async (url, options) => {
    request = { url, options };
    return jsonResponse({ code: 200, data: { taskId: 'kie-task-1' } });
  } });
  const result = await provider.createVideoTask({ kind: 'video', prompt: 'Product reveal', aspectRatio: '9:16', duration: 5, idempotencyKey: 'project:video:1' });
  assert.equal(result.taskId, 'kie-task-1');
  assert.equal(request.options.headers.Authorization, 'Bearer secret');
  assert.equal(request.options.headers['Idempotency-Key'], 'project:video:1');
  assert.equal(JSON.parse(request.options.body).input.prompt, 'Product reveal');
});

test('KieVideoProvider uses the Wan 3.0 reference image field', async () => {
  let payload;
  const provider = new KieVideoProvider({ apiKey: 'secret', fetch: async (_url, options) => {
    payload = JSON.parse(options.body);
    return jsonResponse({ code: 200, data: { taskId: 'kie-task-reference' } });
  } });
  await provider.createVideoTask({ model: 'wan/3-0-video', kind: 'video', prompt: 'Animate product', referenceUrl: 'https://cdn.example/product.jpg', duration: 10, aspectRatio: '1:1', idempotencyKey: 'project:video:reference' });
  assert.deepEqual(payload.input.reference_image_urls, ['https://cdn.example/product.jpg']);
  assert.equal(payload.input.image_urls, undefined);
  assert.match(payload.input.prompt, /Use Image1 as the source of truth/);
});

test('KieVideoProvider uses Qwen3 image-to-image fields for an attached image', async () => {
  const previousImageModel = process.env.KIE_IMAGE_MODEL;
  const previousReferenceModel = process.env.KIE_IMAGE_REFERENCE_MODEL;
  delete process.env.KIE_IMAGE_MODEL;
  delete process.env.KIE_IMAGE_REFERENCE_MODEL;
  let payload;
  const provider = new KieVideoProvider({ apiKey: 'secret', fetch: async (_url, options) => {
    payload = JSON.parse(options.body);
    return jsonResponse({ code: 200, data: { taskId: 'kie-image-reference' } });
  } });
  try {
    await provider.createVideoTask({ kind: 'image', prompt: 'Create a luxury ad', referenceUrl: 'https://cdn.example/product.jpg', aspectRatio: '1:1' });
    assert.equal(payload.model, 'qwen3/image-to-image');
    assert.deepEqual(payload.input.image_urls, ['https://cdn.example/product.jpg']);
    assert.equal(payload.input.image_size, '1:1');
    assert.equal(payload.input.prompt_extend, false);
    assert.match(payload.input.prompt, /Preserve the exact subject or product identity/);
  } finally {
    if (previousImageModel == null) delete process.env.KIE_IMAGE_MODEL; else process.env.KIE_IMAGE_MODEL = previousImageModel;
    if (previousReferenceModel == null) delete process.env.KIE_IMAGE_REFERENCE_MODEL; else process.env.KIE_IMAGE_REFERENCE_MODEL = previousReferenceModel;
  }
});

test('failed jobs expose a friendly MuAPI insufficient-credit message', () => {
  const serialized = serializeGenerationJob({
    id: 'job-1', status: 'FAILED', errorMessage: 'Credits insufficient: current balance is not enough',
    requestPayload: '{}', responsePayload: '{}', progress: 100, retryCount: 0, fallbackCount: 1,
  });
  assert.match(serialized.error, /MuAPI has insufficient credits/i);
  assert.doesNotMatch(serialized.error, /current balance/i);
});

test('KieVideoProvider uploads local reference files before generation', async () => {
  let request;
  const provider = new KieVideoProvider({ apiKey: 'secret', fetch: async (url, options) => {
    request = { url, options };
    return jsonResponse({ success: true, data: { downloadUrl: 'https://tempfile.example/product.jpg' } });
  } });
  const url = await provider.uploadReferenceFile(new File(['image'], 'product.jpg', { type: 'image/jpeg' }));
  assert.equal(url, 'https://tempfile.example/product.jpg');
  assert.equal(request.url, 'https://kieai.redpandaai.co/api/file-stream-upload');
  assert.equal(request.options.headers.Authorization, 'Bearer secret');
  assert.ok(request.options.body instanceof FormData);
});

test('KieVideoProvider normalizes successful task details', async () => {
  const provider = new KieVideoProvider({ apiKey: 'secret', fetch: async () => jsonResponse({ code: 200, data: { state: 'success', progress: 100, creditsConsumed: 12, resultJson: JSON.stringify({ resultUrls: ['https://cdn.example/video.mp4'] }) } }) });
  const result = await provider.getTaskStatus('kie-task-1');
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.url, 'https://cdn.example/video.mp4');
  assert.equal(result.cost, 12);
});

test('ProviderRouter selects MuAPI as the default primary without exposing it to clients', () => {
  const previous = process.env.PRIMARY_VIDEO_PROVIDER;
  delete process.env.PRIMARY_VIDEO_PROVIDER;
  const muapi = { isAvailable: () => true };
  const router = new ProviderRouter({ providers: { KIE: { isAvailable: () => true }, MUAPI: muapi } });
  assert.deepEqual(router.selectPrimaryProvider(), { name: 'MUAPI', client: muapi });
  if (previous == null) delete process.env.PRIMARY_VIDEO_PROVIDER;
  else process.env.PRIMARY_VIDEO_PROVIDER = previous;
});

test('ProviderRouter does not fall back from MuAPI generation jobs', () => {
  const router = new ProviderRouter({ providers: { KIE: { isAvailable: () => true }, MUAPI: { isAvailable: () => true } } });
  assert.equal(router.selectFallbackProvider('MUAPI'), null);
});

test('insufficient provider credits are not retryable', () => {
  const error = new Error('Credits insufficient: Your current balance is not enough to run this request.');
  assert.equal(fallbackEligible(error), true);
  assert.equal(skipPrimaryRetry(error), true);
});

test('MuAPI uses the current MiniMax H3 Open image-to-video contract', async () => {
  const previousKey = process.env.MUAPI_API_KEY;
  const previousModel = process.env.MUAPI_VIDEO_AUDIO_IMAGE_MODEL;
  const previousResolution = process.env.MUAPI_VIDEO_RESOLUTION;
  const previousFetch = globalThis.fetch;
  delete process.env.MUAPI_VIDEO_AUDIO_IMAGE_MODEL;
  delete process.env.MUAPI_VIDEO_RESOLUTION;
  process.env.MUAPI_API_KEY = 'secret';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return jsonResponse({ request_id: 'muapi-video-1' });
  };
  try {
    const result = await submitMuapiGeneration({ kind: 'video', prompt: 'Animate product', referenceUrl: 'https://cdn.example/product.jpg', duration: 10, aspectRatio: '1:1' });
    assert.equal(result.model, 'minimax-h3-open-image-to-video');
    assert.equal(request.url, 'https://api.muapi.ai/api/v1/minimax-h3-open-image-to-video');
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.image_url, 'https://cdn.example/product.jpg');
    assert.equal(payload.resolution, '480p');
    assert.equal(payload.duration, 10);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.MUAPI_API_KEY; else process.env.MUAPI_API_KEY = previousKey;
    if (previousModel == null) delete process.env.MUAPI_VIDEO_AUDIO_IMAGE_MODEL; else process.env.MUAPI_VIDEO_AUDIO_IMAGE_MODEL = previousModel;
    if (previousResolution == null) delete process.env.MUAPI_VIDEO_RESOLUTION; else process.env.MUAPI_VIDEO_RESOLUTION = previousResolution;
  }
});

test('MuAPI submits image generation with the configured aspect ratio', async () => {
  const previousKey = process.env.MUAPI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.MUAPI_API_KEY = 'secret';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return jsonResponse({ request_id: 'muapi-image-1' });
  };
  try {
    const result = await submitMuapiGeneration({ kind: 'image', prompt: 'Luxury product photo', aspectRatio: '4:5' });
    assert.equal(result.model, 'nano-banana');
    assert.equal(request.url, 'https://api.muapi.ai/api/v1/nano-banana');
    assert.deepEqual(JSON.parse(request.options.body), { prompt: 'Luxury product photo', aspect_ratio: '4:5' });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.MUAPI_API_KEY; else process.env.MUAPI_API_KEY = previousKey;
  }
});

test('MuAPI submits audio generation without image-only fields', async () => {
  const previousKey = process.env.MUAPI_API_KEY;
  const previousModel = process.env.MUAPI_AUDIO_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.MUAPI_API_KEY = 'secret';
  delete process.env.MUAPI_AUDIO_MODEL;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return jsonResponse({ request_id: 'muapi-audio-1' });
  };
  try {
    const result = await submitMuapiGeneration({ kind: 'audio', prompt: 'Upbeat product soundtrack', duration: 15, aspectRatio: '9:16' });
    assert.equal(result.model, 'mmaudio-v2/text-to-audio');
    assert.equal(request.url, 'https://api.muapi.ai/api/v1/mmaudio-v2/text-to-audio');
    assert.deepEqual(JSON.parse(request.options.body), { prompt: 'Upbeat product soundtrack', duration: 15 });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.MUAPI_API_KEY; else process.env.MUAPI_API_KEY = previousKey;
    if (previousModel == null) delete process.env.MUAPI_AUDIO_MODEL; else process.env.MUAPI_AUDIO_MODEL = previousModel;
  }
});

test('MuAPI polling selects the requested audio output over preview images', async () => {
  const previousKey = process.env.MUAPI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.MUAPI_API_KEY = 'secret';
  globalThis.fetch = async () => jsonResponse({ status: 'completed', thumbnail_url: 'https://cdn.example/preview.png', outputs: ['https://cdn.example/result.mp3'] });
  try {
    const result = await pollMuapiGeneration('muapi-audio-1', 'audio');
    assert.equal(result.status, 'completed');
    assert.equal(result.url, 'https://cdn.example/result.mp3');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.MUAPI_API_KEY; else process.env.MUAPI_API_KEY = previousKey;
  }
});

test('MuAPI rehosts an external reference before video submission', async () => {
  const previousKey = process.env.MUAPI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.MUAPI_API_KEY = 'secret';
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === 'https://tempfile.example/reference.jpg')
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '3' } });
    if (url === 'https://api.muapi.ai/api/v1/upload_file')
      return jsonResponse({ url: 'https://cdn.muapi.ai/uploads/reference.jpg' });
    if (url === 'https://api.muapi.ai/api/v1/minimax-h3-open-image-to-video')
      return jsonResponse({ request_id: 'muapi-rehosted-video' });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const result = await new MuApiVideoProvider().createVideoTask({ kind: 'video', prompt: 'Animate product', referenceUrl: 'https://tempfile.example/reference.jpg', duration: 10, aspectRatio: '1:1' });
    assert.equal(result.taskId, 'muapi-rehosted-video');
    const submission = requests.find((request) => request.url.endsWith('/minimax-h3-open-image-to-video'));
    assert.equal(JSON.parse(submission.options.body).image_url, 'https://cdn.muapi.ai/uploads/reference.jpg');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.MUAPI_API_KEY; else process.env.MUAPI_API_KEY = previousKey;
  }
});

test('MuAPI reports a clear error when a sandbox key returns a mock image for video', async () => {
  const previousKey = process.env.MUAPI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.MUAPI_API_KEY = 'sandbox-secret';
  globalThis.fetch = async () => jsonResponse({ status: 'completed', outputs: ['https://cdn.muapi.ai/assets/mock.avif'], cost: { amount_usd: 0, amount_credits: 0 } });
  try {
    await assert.rejects(() => pollMuapiGeneration('sandbox-task', 'video'), /sandbox mock image.*production MUAPI_API_KEY/i);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.MUAPI_API_KEY; else process.env.MUAPI_API_KEY = previousKey;
  }
});
