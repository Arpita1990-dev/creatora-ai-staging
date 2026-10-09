import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroundedCampaignVideoPrompt,
  extractGroundedProductAttributes,
  normalizeCampaignVideoDuration,
} from '../lib/campaignVideoPrompt.js';
import { submitMuapiGeneration } from '../lib/muapiGeneration.js';
import { calculateCampaignCreditEstimate, getCampaignCreditEstimate } from '../lib/campaignCreditEstimate.js';

test('campaign video duration is never below 10 and uses a supported provider duration', () => {
  assert.equal(normalizeCampaignVideoDuration(0), 10);
  assert.equal(normalizeCampaignVideoDuration(5), 10);
  assert.equal(normalizeCampaignVideoDuration(10), 10);
  assert.equal(normalizeCampaignVideoDuration(15), 15);
  assert.equal(normalizeCampaignVideoDuration(20), 30);
});

test('campaign video estimates remain provider-priced instead of using a fixed credit amount', () => {
  assert.equal(getCampaignCreditEstimate({ type: 'video' }), null);
  assert.equal(calculateCampaignCreditEstimate([{ type: 'image' }, { type: 'video' }]), null);
  assert.equal(calculateCampaignCreditEstimate([{ type: 'image' }, { type: 'audio' }]), 15);
});

test('video prompt is grounded in generic product details and creates a timed scene plan', () => {
  const brief = {
    product: 'Aurora Trail Bottle',
    description: 'Insulated stainless-steel bottle, leak-resistant lid, matte blue finish, designed for day hikes and daily commutes.',
    country: 'Canada',
    audience: 'Outdoor enthusiasts and commuters',
    objective: 'Product launch',
    style: 'Clean outdoor lifestyle',
  };
  const prompt = buildGroundedCampaignVideoPrompt({ duration: 5, platform: 'Instagram Reel', aspectRatio: '9:16' }, brief, { concept: 'Move confidently from trail to train.' });
  assert.match(prompt, /Aurora Trail Bottle/);
  assert.match(prompt, /Insulated stainless-steel bottle/);
  assert.match(prompt, /SCENE SEQUENCE \(10 seconds\)/);
  assert.match(prompt, /0-3s/);
  assert.match(prompt, /Do not invent prices/);
  assert.doesNotMatch(prompt, /UrbanNest|residential development|swimming pool/i);
  assert.deepEqual(extractGroundedProductAttributes(brief.description).slice(0, 2), ['Insulated stainless-steel bottle', 'leak-resistant lid']);
});

test('grounded campaign videos submit supported durations and use supplied product references', async () => {
  const envNames = [
    'MUAPI_API_KEY',
    'MUAPI_VIDEO_AUDIO_IMAGE_MODEL',
    'MUAPI_VIDEO_30S_IMAGE_MODEL',
  ];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  process.env.MUAPI_API_KEY = 'test-key';
  delete process.env.MUAPI_VIDEO_AUDIO_IMAGE_MODEL;
  delete process.env.MUAPI_VIDEO_30S_IMAGE_MODEL;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) });
    return new Response(JSON.stringify({ request_id: `campaign-${requests.length}` }), { status: 200 });
  };

  try {
    const brief = {
      product: 'Aurora Trail Bottle',
      description: 'Insulated stainless-steel bottle, leak-resistant lid, matte blue finish, designed for day hikes and daily commutes.',
      country: 'Canada',
      audience: 'Outdoor enthusiasts and commuters',
      objective: 'Product launch',
      productImageProvided: true,
    };
    const referenceUrl = 'https://cdn.example/product.jpg';
    const prompt = buildGroundedCampaignVideoPrompt({ duration: 5, platform: 'Instagram Reel', aspectRatio: '9:16' }, brief);
    const tenSecondDuration = normalizeCampaignVideoDuration(5);
    await submitMuapiGeneration({ kind: 'video', prompt, referenceUrl, duration: tenSecondDuration, aspectRatio: '9:16' });

    const thirtySecondDuration = normalizeCampaignVideoDuration(20);
    await submitMuapiGeneration({ kind: 'video', prompt, referenceUrl, duration: thirtySecondDuration, aspectRatio: '9:16' });

    assert.equal(requests[0].url, 'https://api.muapi.ai/api/v1/minimax-h3-open-image-to-video');
    assert.equal(requests[0].payload.duration, 10);
    assert.equal(requests[0].payload.image_url, referenceUrl);
    assert.match(requests[0].payload.prompt, /Aurora Trail Bottle/);
    assert.match(requests[0].payload.prompt, /leak-resistant lid/);
    assert.match(requests[0].payload.prompt, /SCENE SEQUENCE \(10 seconds\)/);

    assert.equal(requests[1].url, 'https://api.muapi.ai/api/v1/seedance-2.5-intl-omni-reference-480p');
    assert.equal(requests[1].payload.duration, 30);
    assert.deepEqual(requests[1].payload.images_list, [referenceUrl]);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

