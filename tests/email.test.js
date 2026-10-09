import test from 'node:test';
import assert from 'node:assert/strict';
import { sendResendEmail } from '../lib/providers/resendEmail.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { deduplicateEmailRequest } from '../lib/emailRequestDeduplication.js';

function setup() {
  const names = ['RESEND_API_KEY', 'EMAIL_FROM_EMAIL', 'EMAIL_FROM_NAME'];
  const previous = names.map((name) => process.env[name]);
  const fetch = globalThis.fetch;
  const log = console.error;
  const requests = [];
  const logs = [];
  process.env.RESEND_API_KEY = 'test-only-resend-secret';
  process.env.EMAIL_FROM_EMAIL = 'notifications@creatora-ai.online';
  process.env.EMAIL_FROM_NAME = 'Creatora AI';
  console.error = (...args) => logs.push(args);
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify({ id: 'test-message' }), { headers: { 'content-type': 'application/json' } });
  };
  return { requests, logs, restore() {
    names.forEach((name, index) => previous[index] == null ? delete process.env[name] : (process.env[name] = previous[index]));
    globalThis.fetch = fetch;
    console.error = log;
  } };
}

const message = { to: 'user@example.com', subject: 'Verify your email', html: '<p>Verify</p>', text: 'Verify', idempotencyKey: 'verification:opaque-test-token' };

test('identical email submissions coalesce in flight and replay successful responses', async () => {
  let calls = 0;
  const operation = async () => {
    calls += 1;
    await Promise.resolve();
    return Response.json({ emailSent: true }, { status: 201 });
  };
  const body = { email: 'duplicate@example.com', password: 'test-password' };
  const responses = await Promise.all([
    deduplicateEmailRequest('signup', body, operation),
    deduplicateEmailRequest('signup', { password: 'test-password', email: ' DUPLICATE@example.com ' }, operation),
  ]);
  assert.equal(calls, 1);
  for (const response of responses) {
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { emailSent: true });
  }
  await deduplicateEmailRequest('signup', body, operation);
  assert.equal(calls, 1);
  await deduplicateEmailRequest('resend-verification', body, operation);
  assert.equal(calls, 2);
});

test('delivery failures remain retryable and request replay expires after 60 seconds', async () => {
  let calls = 0;
  const body = { email: 'retry@example.com' };
  const failed = async () => { calls += 1; return Response.json({ emailSent: false }, { status: 201 }); };
  await deduplicateEmailRequest('signup', body, failed);
  await deduplicateEmailRequest('signup', body, failed);
  assert.equal(calls, 2);
  const rejected = async () => { calls += 1; throw new Error('safe failure'); };
  await assert.rejects(deduplicateEmailRequest('signup', body, rejected), /safe failure/);
  await assert.rejects(deduplicateEmailRequest('signup', body, rejected), /safe failure/);
  assert.equal(calls, 4);
  const success = async () => { calls += 1; return Response.json({ ok: true }); };
  await deduplicateEmailRequest('resend-verification', body, success);
  const dateNow = Date.now;
  Date.now = () => dateNow() + 60_001;
  try { await deduplicateEmailRequest('resend-verification', body, success); }
  finally { Date.now = dateNow; }
  assert.equal(calls, 6);
});

test('email service preserves verification and reset links, branding and expiry', async () => {
  const context = setup();
  try {
    await sendVerificationEmail(message.to, 'test/token?');
    await sendPasswordResetEmail(message.to, 'test/token?');
    const verification = JSON.parse(context.requests[0].options.body);
    const reset = JSON.parse(context.requests[1].options.body);
    assert.match(verification.html, /Creatora AI/);
    assert.match(verification.html, /Create\. Publish\. Grow\./);
    assert.match(verification.html, /Verify your email/);
    assert.match(verification.html, /verify-email\?token=test%2Ftoken%3F/);
    assert.match(verification.text, /24 hours/);
    assert.match(reset.html, /reset-password\?token=test%2Ftoken%3F/);
    assert.match(reset.text, /one hour/);
    assert.match(verification.text, /If you did not request this, you can safely ignore this email\./);
    assert.notEqual(new Headers(context.requests[0].options.headers).get('idempotency-key'), new Headers(context.requests[1].options.headers).get('idempotency-key'));
  } finally { context.restore(); }
});

test('official SDK sends server-side with text, bounded timeout and opaque idempotency key', async () => {
  const context = setup();
  try {
    assert.equal(await sendResendEmail(message), true);
    const request = context.requests[0];
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(JSON.parse(request.options.body).from, 'Creatora AI <notifications@creatora-ai.online>');
    assert.equal(JSON.parse(request.options.body).text, 'Verify');
    assert.ok(request.options.signal instanceof AbortSignal);
    const headers = new Headers(request.options.headers);
    assert.match(headers.get('idempotency-key'), /^creatora-[a-f0-9]{64}$/);
    assert.ok(!headers.get('idempotency-key').includes('opaque-test-token'));
    await sendResendEmail(message);
    assert.equal(new Headers(context.requests[1].options.headers).get('idempotency-key'), headers.get('idempotency-key'));
  } finally { context.restore(); }
});

test('missing credentials and invalid addresses fail before any request', async () => {
  const context = setup();
  try {
    delete process.env.RESEND_API_KEY;
    await assert.rejects(sendResendEmail(message), { code: 'EMAIL_NOT_CONFIGURED' });
    process.env.RESEND_API_KEY = 'test-only-resend-secret';
    delete process.env.EMAIL_FROM_EMAIL;
    await assert.rejects(sendResendEmail(message), { code: 'EMAIL_NOT_CONFIGURED' });
    process.env.EMAIL_FROM_EMAIL = 'not-an-address';
    await assert.rejects(sendResendEmail(message), { code: 'EMAIL_PROVIDER_ERROR' });
    process.env.EMAIL_FROM_EMAIL = 'notifications@creatora-ai.online';
    await assert.rejects(sendResendEmail({ ...message, to: 'bad-recipient' }), { code: 'EMAIL_PROVIDER_ERROR' });
    assert.equal(context.requests.length, 0);
  } finally { context.restore(); }
});

test('provider failures log only safe categories and never return raw errors', async () => {
  const context = setup();
  try {
    for (const [status, name, detail, category] of [
      [401, 'invalid_api_key', 'secret provider details', 'invalid-api-key'],
      [403, 'validation_error', 'Domain is not verified', 'unverified-domain'],
      [422, 'validation_error', 'Invalid from address', 'invalid-sender'],
      [422, 'validation_error', 'Invalid recipient', 'invalid-recipient'],
      [429, 'rate_limit_exceeded', 'too many requests', 'rate-limit'],
      [500, 'internal_server_error', 'secret provider details', 'provider-failure'],
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ name, message: detail }), { status, headers: { 'content-type': 'application/json' } });
      await assert.rejects(sendResendEmail(message), { message: 'Email could not be delivered. Please try again later.', code: 'EMAIL_PROVIDER_ERROR' });
      assert.equal(context.logs.at(-1)[1].category, category);
      assert.equal(context.logs.at(-1)[1].status, status);
    }
    const timeout = AbortSignal.timeout;
    AbortSignal.timeout = () => AbortSignal.abort(new DOMException('secret details', 'TimeoutError'));
    globalThis.fetch = async (_url, options) => { throw options.signal.reason; };
    try { await assert.rejects(sendResendEmail(message), { code: 'EMAIL_PROVIDER_ERROR' }); }
    finally { AbortSignal.timeout = timeout; }
    assert.equal(context.logs.at(-1)[1].category, 'timeout');
    assert.ok(!JSON.stringify(context.logs).includes('secret'));
    assert.ok(!JSON.stringify(context.logs).includes(message.to));
  } finally { context.restore(); }
});