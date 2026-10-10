import test from 'node:test';
import assert from 'node:assert/strict';

import { permanentlyDeleteAssets, permanentlyDeleteProjects } from '../lib/permanentDeletion.js';

function databaseStub({ jobs = [], campaigns = [], assets = [] } = {}) {
  const calls = [];
  const model = (name, rows = []) => ({
    findMany: async (query) => { calls.push([`${name}.findMany`, query]); return rows; },
    deleteMany: async (query) => { calls.push([`${name}.deleteMany`, query]); return { count: 1 }; },
    updateMany: async (query) => { calls.push([`${name}.updateMany`, query]); return { count: 1 }; },
  });
  const tx = {
    generationJob: model('generationJob', jobs),
    generationUsage: model('generationUsage'),
    providerAttempt: model('providerAttempt'),
    publishJob: model('publishJob'),
    asset: model('asset', assets),
    campaign: model('campaign', campaigns),
    project: model('project'),
  };
  return {
    calls,
    $transaction: async (operation) => operation(tx),
  };
}

test('asset deletion removes dependent attempts, jobs, publish records, and the asset', async () => {
  const database = databaseStub({ jobs: [{ id: 'job-1' }] });
  const deleted = await permanentlyDeleteAssets(database, [{ id: 'asset-1', outputUrl: 'supplied-output', thumbnailUrl: 'supplied-thumbnail' }]);
  assert.equal(deleted, 1);
  assert.deepEqual(database.calls.map(([name]) => name), [
    'project.updateMany',
    'project.updateMany',
    'project.updateMany',
    'generationJob.findMany',
    'providerAttempt.deleteMany',
    'generationUsage.updateMany',
    'generationJob.deleteMany',
    'publishJob.deleteMany',
    'asset.deleteMany',
  ]);
  const reservationCancellation = database.calls.find(([name]) => name === 'generationUsage.updateMany');
  assert.deepEqual(reservationCancellation[1], {
    where: { generationJobId: { in: ['job-1'] }, status: 'RESERVED' },
    data: { status: 'CANCELLED', expiresAt: null },
  });
});

test('project deletion is scoped to the confirmed project and removes its dependent records', async () => {
  const database = databaseStub({
    campaigns: [{ id: 'campaign-1' }],
    assets: [{ id: 'asset-1', projectId: 'project-1' }],
    jobs: [{ id: 'job-1' }],
  });
  const deleted = await permanentlyDeleteProjects(database, [{ id: 'project-1' }]);
  assert.equal(deleted, 1);
  const projectDelete = database.calls.find(([name]) => name === 'project.deleteMany');
  assert.deepEqual(projectDelete[1], { where: { id: { in: ['project-1'] } } });
  assert.ok(database.calls.some(([name]) => name === 'campaign.deleteMany'));
  assert.ok(database.calls.some(([name]) => name === 'asset.deleteMany'));
});
