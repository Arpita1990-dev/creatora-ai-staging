import 'server-only';
import { sendResendEmail } from './providers/resendEmail.js';
import { getAppUrl } from './appUrl.js';

export function sendEmail(message) {
  return sendResendEmail(message);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function actionEmail({ to, token, path, subject, title, description, action, expiration, operation }) {
  const actionUrl = new URL(path, `${getAppUrl()}/`);
  actionUrl.searchParams.set('token', token);
  const url = actionUrl.toString();
  const security = 'If you did not request this, you can safely ignore this email.';
  return sendEmail({
    to, subject, idempotencyKey: `${operation}:${to}:${token}`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#202124;max-width:560px;margin:0 auto;padding:32px 20px"><h2>Creatora AI</h2><p>Create. Publish. Grow.</p><hr style="border:0;border-top:1px solid #e5e7eb"><h1 style="font-size:24px">${title}</h1><p>${description}</p><p style="padding:16px 0"><a href="${escapeHtml(url)}" style="background:#176b45;color:#ffffff;padding:12px 20px;border-radius:4px;text-decoration:none">${action}</a></p><p>${expiration}</p><p style="font-size:14px;color:#555555">${security}</p></div>`,
    text: `Creatora AI\nCreate. Publish. Grow.\n\n${title}\n${description}\n\n${action}: ${url}\n\n${expiration}\n${security}`,
  });
}

export function sendVerificationEmail(email, token) {
  return actionEmail({ to: email, token, path: 'verify-email', subject: 'Verify your Creatora AI email', title: 'Verify your email', description: 'Verify your email to activate your account.', action: 'Verify email', expiration: 'This verification link expires in 24 hours.', operation: 'verification' });
}

export function sendPasswordResetEmail(email, token) {
  return actionEmail({ to: email, token, path: 'reset-password', subject: 'Reset your Creatora AI password', title: 'Reset your password', description: 'Reset your password using this secure link.', action: 'Reset password', expiration: 'This password reset link expires in one hour.', operation: 'password-reset' });
}
