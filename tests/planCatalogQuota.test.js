import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertGenerationQuota,
  assertProjectCapacity,
  createProjectWithCapacity,
  planDefinition,
  reserveGenerationUsage,
} from '../lib/planCatalog.js';
import { muApiGenerationKind } from '../lib/muapiGenerationKind.js';

const freePlan = planDefinition('free');
const freeEntitlement = { ...freePlan, plan: freePlan, code: 'free' };

test('Free project capacity returns structured project-limit details', () => {
  assert.throws(() => assertProjectCapacity(freeEntitlement, 2), (error) => {
    assert.equal(error.code, 'PROJECT_LIMIT_REACHED');
    assert.equal(error.limit, 2);
    assert.equal(error.used, 2);
    return true;
  });
});

test('Free generation capacity counts completed and pending usage, not provider balances', async () => {
  let query;
  const database = {
    generationUsage: {
      count: async (value) => { query = value; return 5; },
    },
  };
  await assert.rejects(
    assertGenerationQuota(database, freeEntitlement, { organizationId: 'personal-workspace', kind: 'video' }),
    (error) => {
      assert.equal(error.code, 'GENERATION_LIMIT_REACHED');
      assert.equal(error.generationType, 'VIDEO');
      assert.equal(error.limit, 5);
      assert.equal(error.used, 5);
      return true;
    },
  );
  assert.deepEqual(query.where.status.in, ['RESERVED', 'COMPLETED']);
});

test('reservation checks usage under the workspace lock before inserting', async () => {
  let lockTaken = false;
  let created = null;
  const transaction = {
    $queryRaw: async () => { lockTaken = true; },
    organization: { findUnique: async () => ({ id: 'personal-workspace', subscription: null }) },
    generationUsage: {
      findUnique: async () => null,
      count: async () => 4,
      create: async ({ data }) => { created = data; return data; },
    },
  };
  const { lockWorkspaceQuota } = await import('../lib/planCatalog.js');
  await lockWorkspaceQuota(transaction, 'personal-workspace');
  const usage = await reserveGenerationUsage(transaction, {
    organizationId: 'personal-workspace',
    userId: 'user-1',
    kind: 'image',
    idempotencyKey: 'generation-1',
    generationJobId: 'generation-1',
  });
  assert.equal(lockTaken, true);
  assert.equal(usage.status, 'RESERVED');
  assert.equal(created.generationType, 'IMAGE');
  assert.equal(created.planAtGeneration, 'free');
});

test('project creation locks the workspace and rejects the third active project', async () => {
  let locked = false;
  let created = false;
  const transaction = {
    $queryRaw: async () => { locked = true; },
    organization: { findUnique: async () => ({ id: 'personal-workspace', subscription: null }) },
    project: {
      count: async () => 2,
      create: async () => { created = true; },
    },
  };
  const database = { $transaction: (operation) => operation(transaction) };
  await assert.rejects(createProjectWithCapacity(database, 'personal-workspace', { name: 'Third' }), (error) => error.code === 'PROJECT_LIMIT_REACHED');
  assert.equal(locked, true);
  assert.equal(created, false);
});

test('MuAPI generation type is derived from known endpoints, not an arbitrary client label', () => {
  assert.equal(muApiGenerationKind('flux-schnell-image'), 'IMAGE');
  assert.equal(muApiGenerationKind('seedance-2.5-text-to-video'), 'VIDEO');
  assert.equal(muApiGenerationKind('unlisted-endpoint'), null);
});