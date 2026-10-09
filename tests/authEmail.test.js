import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';

let state;
const tokenStore = (name) => ({
  create: async ({ data }) => { const record = { ...data, id: `${name}-${state[name].length}`, usedAt: null }; state[name].push(record); return record; },
  findUnique: async ({ where }) => state[name].find((record) => record.tokenHash === where.tokenHash) || null,
  updateMany: async ({ where, data }) => { state[name].filter((record) => record.userId === where.userId && record.usedAt === null).forEach((record) => Object.assign(record, data)); },
  update: async ({ where, data }) => Object.assign(state[name].find((record) => record.id === where.id), data),
});
const database = {
  user: {
    findUnique: async ({ where }) => state.user?.email === where.email ? state.user : null,
    create: async ({ data }) => (state.user = { ...data, id: 'test-user', status: 'PENDING_VERIFICATION', emailVerifiedAt: null }),
    update: async ({ data }) => Object.assign(state.user, data),
  },
  emailVerificationToken: tokenStore('verification'),
  passwordResetToken: tokenStore('reset'),
  organization: { create: async ({ data }) => ({ ...data, id: 'test-workspace' }) },
  organizationMember: { create: async () => ({}) },
  plan: { upsert: async () => ({ id: 'free-plan', monthlyCredits: 0 }) },
  billingAccount: { create: async () => ({ id: 'billing-account' }) },
  creditWallet: { create: async () => ({}) },
  subscription: { create: async () => ({}) },
  refreshSession: { updateMany: async () => { state.sessionsRevoked = true; } },
  $transaction: async (operation) => typeof operation === 'function' ? operation(database) : Promise.all(operation),
};
const auth = {
  hashToken: (token) => createHash('sha256').update(token).digest('hex'),
  createOpaqueToken: () => randomBytes(48).toString('base64url'),
  normalizeEmail: (value) => String(value || '').trim().toLowerCase(),
  assertPassword: () => {},
  checkRateLimit: (key, limit) => {
    const count = (state.rateLimits.get(key) || 0) + 1;
    state.rateLimits.set(key, count);
    if (count > limit) throw new Error('Too many requests. Please try again later.');
  },
  clearRefreshCookie: () => ({ name: 'test-refresh', value: '', options: {} }),
};
globalThis.__creatoraEmailTestDatabase = database;
globalThis.__creatoraEmailTestAuth = auth;
const sourceModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const authNames = ['assertPassword', 'checkRateLimit', 'clearRefreshCookie', 'createOpaqueToken', 'createSession', 'currentRefreshToken', 'hashToken', 'normalizeEmail', 'refreshCookie', 'rotateSession', 'signAccessToken'];
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/prisma') return { url: sourceModule('export const prisma = globalThis.__creatoraEmailTestDatabase;'), shortCircuit: true };
  if (specifier === '@/lib/auth') return { url: sourceModule(authNames.map((name) => `export const ${name} = globalThis.__creatoraEmailTestAuth.${name};`).join('\n')), shortCircuit: true };
  if (specifier === '@/lib/planCatalog') return { url: sourceModule('export const planRecordData = () => ({});'), shortCircuit: true };
  if (specifier === 'bcryptjs') return { url: sourceModule('export default { hash: async () => "test-password-hash" };'), shortCircuit: true };
  if (specifier === 'next/server') return { url: sourceModule('export const NextResponse = { json(data, options) { const response = Response.json(data, options); response.cookies = { set() {} }; return response; } };'), shortCircuit: true };
  if (specifier.startsWith('@/lib/')) return { url: new URL(`../lib/${specifier.slice(6)}.js`, import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
let POST;
try { ({ POST } = await import('../app/api/auth/[action]/route.js')); }
finally { hooks.deregister(); }

function setup(email) {
  state = { user: null, verification: [], reset: [], sessionsRevoked: false, rateLimits: new Map() };
  const names = ['APP_URL', 'RESEND_API_KEY', 'EMAIL_FROM_EMAIL', 'EMAIL_FROM_NAME'];
  const previous = names.map((name) => process.env[name]);
  const fetch = globalThis.fetch;
  const log = console.error;
  const emails = [];
  process.env.APP_URL = 'http://localhost:3000';
  process.env.RESEND_API_KEY = 'test-only-resend-key';
  process.env.EMAIL_FROM_EMAIL = 'notifications@creatora-ai.online';
  process.env.EMAIL_FROM_NAME = 'Creatora AI';
  console.error = () => {};
  globalThis.fetch = async (_url, options) => {
    emails.push(JSON.parse(options.body));
    return Response.json({ id: 'test-delivery' });
  };
  return { email, emails, restore() {
    names.forEach((name, index) => previous[index] == null ? delete process.env[name] : (process.env[name] = previous[index]));
    globalThis.fetch = fetch;
    console.error = log;
  } };
}

function request(action, body) {
  return POST(new Request(`http://localhost:3000/api/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ action }) });
}
const signupBody = (email) => ({ email, password: 'Test-password1!', passwordConfirmation: 'Test-password1!', accountType: 'PERSONAL' });
const deliveredUrl = (email, action) => new URL(email.text.match(new RegExp(`${action}: (.+)`))[1]);
const deliveredToken = (email, action) => deliveredUrl(email, action).searchParams.get('token');

test('signup and resend deliver once per repeated request without changing hashed tokens or expiry', async () => {
  const context = setup('auth-signup@example.com');
  try {
    const before = Date.now();
    const responses = await Promise.all([request('signup', signupBody(context.email)), request('signup', signupBody(context.email))]);
    assert.equal(context.emails.length, 1);
    assert.equal(deliveredUrl(context.emails[0], 'Verify email').origin, 'http://localhost:3000');
    assert.equal(deliveredUrl(context.emails[0], 'Verify email').pathname, '/verify-email');
    for (const response of responses) { assert.equal(response.status, 201); assert.equal((await response.json()).emailSent, true); }
    const token = deliveredToken(context.emails[0], 'Verify email');
    assert.equal(state.verification[0].tokenHash, auth.hashToken(token));
    assert.notEqual(state.verification[0].tokenHash, token);
    assert.ok(state.verification[0].expiresAt.getTime() >= before + 86_400_000);
    assert.equal(state.user.status, 'PENDING_VERIFICATION');
    const resend = await Promise.all([request('resend-verification', { email: context.email }), request('resend-verification', { email: context.email })]);
    assert.equal(context.emails.length, 2);
    assert.equal(deliveredUrl(context.emails[1], 'Verify email').origin, 'http://localhost:3000');
    assert.equal(state.verification.length, 2);
    for (const response of resend) assert.equal(response.status, 200);
    assert.equal(state.rateLimits.get('signup:local'), 2);
    assert.equal(state.rateLimits.get('resend-verification:local'), 2);
  } finally { context.restore(); }
});

test('incorrect, expired and used verification links fail; correct link activates the account', async () => {
  const context = setup('auth-verify@example.com');
  try {
    await request('signup', signupBody(context.email));
    const token = deliveredToken(context.emails[0], 'Verify email');
    assert.equal((await request('verify-email', { token: 'wrong-token' })).status, 400);
    assert.equal(state.user.status, 'PENDING_VERIFICATION');
    state.verification[0].expiresAt = new Date(Date.now() - 1000);
    assert.equal((await request('verify-email', { token })).status, 400);
    state.verification[0].expiresAt = new Date(Date.now() + 86_400_000);
    assert.equal((await request('verify-email', { token })).status, 200);
    assert.equal(state.user.status, 'ACTIVE');
    assert.ok(state.user.emailVerifiedAt instanceof Date);
    assert.ok(state.verification[0].usedAt instanceof Date);
    assert.equal((await request('verify-email', { token })).status, 400);
    assert.equal(context.emails.length, 1);
  } finally { context.restore(); }
});

test('password recovery delivers a one-hour reset link and preserves reset verification and session revocation', async () => {
  const context = setup('auth-reset@example.com');
  try {
    state.user = { id: 'test-user', email: context.email, status: 'ACTIVE', emailVerifiedAt: new Date() };
    const before = Date.now();
    assert.equal((await request('forgot-password', { email: context.email })).status, 200);
    assert.equal(deliveredUrl(context.emails[0], 'Reset password').origin, 'http://localhost:3000');
    assert.equal(deliveredUrl(context.emails[0], 'Reset password').pathname, '/reset-password');
    const token = deliveredToken(context.emails[0], 'Reset password');
    assert.equal(state.reset[0].tokenHash, auth.hashToken(token));
    assert.ok(state.reset[0].expiresAt.getTime() >= before + 3_600_000);
    assert.equal((await request('reset-password', { token: 'wrong', password: 'Test-password1!' })).status, 400);
    state.reset[0].expiresAt = new Date(Date.now() - 1000);
    assert.equal((await request('reset-password', { token, password: 'Test-password1!' })).status, 400);
    state.reset[0].expiresAt = new Date(Date.now() + 3_600_000);
    assert.equal((await request('reset-password', { token, password: 'Test-password1!' })).status, 200);
    assert.ok(state.reset[0].usedAt instanceof Date);
    assert.equal(state.sessionsRevoked, true);
    assert.equal((await request('reset-password', { token, password: 'Test-password1!' })).status, 400);
  } finally { context.restore(); }
});

test('delivery errors preserve pending signup, allow retry, and never expose raw provider errors', async () => {
  const context = setup('auth-failure@example.com');
  try {
    globalThis.fetch = async () => Response.json({ name: 'invalid_api_key', message: 'private-provider-diagnostic' }, { status: 401 });
    const signup = await request('signup', signupBody(context.email));
    assert.equal(signup.status, 201);
    assert.equal((await signup.json()).emailSent, false);
    assert.equal(state.user.status, 'PENDING_VERIFICATION');
    assert.equal(state.user.emailVerifiedAt, null);
    const retried = await request('signup', signupBody(context.email));
    assert.equal((await retried.json()).emailSent, false);
    assert.equal(state.verification.length, 2);
    const resend = await request('resend-verification', { email: context.email });
    assert.equal(resend.status, 400);
    assert.ok(!(await resend.text()).includes('private-provider-diagnostic'));
    state.user.status = 'ACTIVE';
    const forgot = await request('forgot-password', { email: context.email });
    assert.equal(forgot.status, 200);
    assert.match((await forgot.json()).message, /If an account exists/);
    assert.equal(state.sessionsRevoked, false);
  } finally { context.restore(); }
});

test('duplicate requests still count toward the existing authentication rate limit', async () => {
  const context = setup('auth-limit@example.com');
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await request('resend-verification', { email: context.email })).status, 200);
    assert.equal((await request('resend-verification', { email: context.email })).status, 429);
    assert.equal(context.emails.length, 0);
  } finally { context.restore(); }
});

test('staging application URL is used for signup, resend and password reset links', async () => {
  const context = setup('auth-staging@example.com');
  const stagingUrl = 'https://creatora-ai-staging-bwryp6uey-arpita1990-devs-projects.vercel.app';
  try {
    process.env.APP_URL = stagingUrl;
    await request('signup', signupBody(context.email));
    assert.equal(deliveredUrl(context.emails[0], 'Verify email').origin, stagingUrl);
    assert.equal(deliveredUrl(context.emails[0], 'Verify email').pathname, '/verify-email');

    await request('resend-verification', { email: context.email });
    assert.equal(deliveredUrl(context.emails[1], 'Verify email').origin, stagingUrl);

    state.user.status = 'ACTIVE';
    await request('forgot-password', { email: context.email });
    assert.equal(deliveredUrl(context.emails[2], 'Reset password').origin, stagingUrl);
    assert.equal(deliveredUrl(context.emails[2], 'Reset password').pathname, '/reset-password');
  } finally { context.restore(); }
});