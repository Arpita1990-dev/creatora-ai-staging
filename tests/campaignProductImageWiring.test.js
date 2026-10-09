import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Campaign Agent sends only the selected product image after generation is initiated', async () => {
  const source = await readFile(new URL('../app/dashboard/[section]/page.js', import.meta.url), 'utf8');
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /generationForm\.append\("productImage", productImage\.file, productImage\.name\)/);
  assert.match(source, /generate-assets\?campaignId=/);
  assert.doesNotMatch(source, /generationForm\.append\([^\n]*(brandKit|assetLibrary|workspaceFile|projectFile)/i);
});

test('generation route authorizes campaign ownership before reading image bytes', async () => {
  const source = await readFile(new URL('../app/api/campaign-agent/generate-assets/route.js', import.meta.url), 'utf8');
  const authentication = source.indexOf('getAuthenticatedUser(request)');
  const ownership = source.indexOf('getCampaign(campaignId, user.workspaceId)');
  const formRead = source.indexOf('request.formData()');
  assert.ok(authentication >= 0 && authentication < ownership);
  assert.ok(ownership >= 0 && ownership < formRead);
  assert.match(source, /referenceFile: asset\.type === 'video' \? productImage : null/);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\([^\n]*(signed|apiKey|token|productImage\.url)/i);
});
