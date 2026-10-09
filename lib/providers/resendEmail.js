import 'server-only';
import { Resend } from 'resend';
import { createHash } from 'node:crypto';

const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

function deliveryError(category, status = null) {
  console.error('Transactional email delivery failed.', { provider: 'resend', operation: 'send-email', status, category });
  const error = new Error(category === 'configuration'
    ? 'Email delivery is not configured. Please contact support.'
    : 'Email could not be delivered. Please try again later.');
  error.code = category === 'configuration' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_PROVIDER_ERROR';
  return error;
}

function errorCategory(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  const status = error?.statusCode;
  if (/domain.*verif|verif.*domain/i.test(message)) return 'unverified-domain';
  if (status === 401 || /api_key|authentication/i.test(name)) return 'invalid-api-key';
  if (status === 429 || /rate_limit/i.test(name)) return 'rate-limit';
  if (/recipient|\bto\b.*email/i.test(message)) return 'invalid-recipient';
  if (/sender|\bfrom\b/i.test(message)) return 'invalid-sender';
  if (/timeout|abort/i.test(name)) return 'timeout';
  return 'provider-failure';
}

export async function sendResendEmail({ to, subject, html, text, idempotencyKey }) {
  if (typeof window !== 'undefined') throw new Error('Email delivery is server-only.');
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const senderEmail = process.env.EMAIL_FROM_EMAIL?.trim();
  const senderName = process.env.EMAIL_FROM_NAME?.trim() || 'Creatora AI';
  if (!apiKey || !senderEmail) throw deliveryError('configuration');
  if (!emailPattern.test(senderEmail) || /[\r\n<>]/.test(senderName)) throw deliveryError('invalid-sender');
  if (typeof to !== 'string' || !emailPattern.test(to)) throw deliveryError('invalid-recipient');

  const resend = new Resend(apiKey);
  let providerStatus = null;
  resend.logError = (_error, _path, status) => { providerStatus = Number.isInteger(status) ? status : null; };
  const signal = AbortSignal.timeout(15_000);
  let response;
  try {
    response = await resend.emails.send({ from: `${senderName} <${senderEmail}>`, to: [to], subject, html, ...(text ? { text } : {}) }, {
      signal,
      ...(idempotencyKey ? { idempotencyKey: `creatora-${createHash('sha256').update(idempotencyKey).digest('hex')}` } : {}),
    });
  } catch (error) {
    throw deliveryError(signal.aborted ? 'timeout' : errorCategory(error));
  }
  if (response.error) throw deliveryError(signal.aborted ? 'timeout' : errorCategory({ ...response.error, statusCode: response.error.statusCode ?? providerStatus }), Number.isInteger(response.error.statusCode) ? response.error.statusCode : providerStatus);
  if (!response.data?.id) throw deliveryError('provider-failure');
  return true;
}