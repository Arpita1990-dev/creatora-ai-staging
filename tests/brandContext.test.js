import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBrandContext, buildBrandedPrompt, selectBrandContext } from '../lib/brandContext.js';
import { callToActionFilter, logoOverlayPosition } from '../lib/rendering/ffmpegRenderer.js';

test('brand prompt enriches without replacing the user request', () => {
  const result = buildBrandedPrompt('Create a mindfulness app ad.', {
    brandName: 'MoodMap',
    tone: 'Clear, confident and warm',
    brandColors: ['#7655F6', '#101011'],
  });
  assert.ok(result.startsWith('Create a mindfulness app ad.'));
  assert.match(result, /Brand: MoodMap/);
  assert.match(result, /Clear, confident and warm/);
  assert.equal(buildBrandedPrompt('Keep my prompt.', null), 'Keep my prompt.');
});

test('purpose filtering excludes visual fields from avatar script context', () => {
  const selected = selectBrandContext({
    brandName: 'MoodMap',
    description: 'Wellness platform',
    brandColors: ['#7655F6'],
    tone: 'Warm',
    targetAudience: 'Young professionals',
    callToAction: 'Start Your Journey',
    imageStyle: 'Product photography',
    videoStyle: 'Short-form motion',
    logoAssetId: 'private-asset-id',
    logoPlacement: 'top-left',
    applyLogoToVideos: true,
  }, 'AVATAR');
  assert.equal(selected.brandColors, undefined);
  assert.equal(selected.imageStyle, undefined);
  assert.equal(selected.brandName, 'MoodMap');
  assert.equal(selected.videoStyle, 'Short-form motion');
  assert.doesNotMatch(buildBrandedPrompt('Promote the new feature.', selected), /#7655F6|private-asset-id|top-left/);
});

test('video logo placement supports each saved position and defaults safely', () => {
  assert.equal(logoOverlayPosition('top-left'), '48:48');
  assert.equal(logoOverlayPosition('top-right'), 'W-w-48:48');
  assert.equal(logoOverlayPosition('center'), '(W-w)/2:(H-h)/2');
  assert.equal(logoOverlayPosition('bottom-left'), '48:H-h-48');
  assert.equal(logoOverlayPosition('bottom-right'), 'W-w-48:H-h-48');
  assert.equal(logoOverlayPosition('invalid'), 'W-w-48:H-h-48');
});

test('a user without active organization membership cannot load that organization brand kit', async () => {
  let brandKitRead = false;
  const database = {
    organization: { findUnique: async ({ where }) => {
      assert.deepEqual(where, { id: 'org-a' });
      return { accountType: 'ORGANIZATION' };
    } },
    organizationMember: { findUnique: async ({ where }) => {
      assert.deepEqual(where, { organizationId_userId: { organizationId: 'org-a', userId: 'user-b' } });
      return null;
    } },
    brandKit: { findUnique: async () => { brandKitRead = true; return null; } },
  };
  await assert.rejects(
    buildBrandContext({ organizationId: 'org-a', userId: 'user-b', purpose: 'IMAGE' }, database),
    /Organization access denied/,
  );
  assert.equal(brandKitRead, false);
});

test('video call-to-action filter supplies an explicit font file', () => {
  const filter = callToActionFilter({
    inputLabel: 'base',
    text: 'Shop now',
    fontFile: 'C:\\Windows\\Fonts\\arial.ttf',
    brandColor: '#FF5A36',
    fontSize: 59,
    start: 2.5,
  });
  assert.match(filter, /drawtext=fontfile='C\\:\/Windows\/Fonts\/arial\.ttf'/);
  assert.match(filter, /text='Shop now'/);
});