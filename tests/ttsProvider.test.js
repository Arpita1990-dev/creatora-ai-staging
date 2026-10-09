import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateTtsScript,
  getLanguageConfig,
  getVoiceOptions,
  TTS_LANGUAGE_OPTIONS,
} from '../lib/tts/index.js';
import { OpenAiTtsProvider } from '../lib/tts/openaiProvider.js';

test('TTS language config centralizes en-IN and hi-IN identifiers', () => {
  assert.equal(TTS_LANGUAGE_OPTIONS.enIN.code, 'en-IN');
  assert.equal(TTS_LANGUAGE_OPTIONS.hiIN.code, 'hi-IN');
  assert.equal(getLanguageConfig('hi-IN').label, 'Hindi');
  assert.equal(getLanguageConfig('en-IN').label, 'English');
});

test('OpenAI TTS provider can synthesize Hindi audio and returns provider metadata', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.TTS_API_KEY;
  const previousModel = process.env.TTS_MODEL;
  process.env.TTS_API_KEY = 'secret';
  process.env.TTS_MODEL = 'gpt-4o-mini-tts';
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'gpt-4o-mini-tts');
    assert.equal(payload.voice, 'alloy');
    assert.match(payload.input, /नमस्कार/);
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };

  try {
    const provider = new OpenAiTtsProvider();
    const result = await provider.synthesize({
      text: 'नमस्कार, यह हिंदी आवाज है।',
      language: 'hi-IN',
      voice: 'alloy',
      style: 'Natural',
    });
    assert.equal(result.provider, 'openai');
    assert.equal(result.language, 'hi-IN');
    assert.ok(result.audioPath || result.audioUrl);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.TTS_API_KEY; else process.env.TTS_API_KEY = previousKey;
    if (previousModel == null) delete process.env.TTS_MODEL; else process.env.TTS_MODEL = previousModel;
  }
});

test('generated voice scripts are capped to the selected video duration', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'secret';
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.input[0].content, /no more than 12 spoken words/);
    return Response.json({ output_text: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.' });
  };

  try {
    const script = await generateTtsScript({ prompt: 'A new product', duration: 5 });
    assert.ok(script.split(/\s+/).length <= 12);
    assert.match(script, /[.!?।…]$/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('voice option list includes English and Hindi language defaults', () => {
  const voices = getVoiceOptions('hi-IN');
  assert.ok(voices.some((voice) => voice.value === 'alloy'));
  assert.ok(voices.some((voice) => voice.value === 'sage'));
});
