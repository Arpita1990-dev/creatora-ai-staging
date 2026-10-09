import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publicErrorMessage } from '@/lib/publicErrors';
import { assertPassword, checkRateLimit, clearRefreshCookie, createOpaqueToken, createSession, currentRefreshToken, hashToken, normalizeEmail, refreshCookie, rotateSession, signAccessToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { sendPasswordResetEmail, sendVerificationEmail } from '@/lib/email';
import { deduplicateEmailRequest } from '@/lib/emailRequestDeduplication';
import { planRecordData } from '@/lib/planCatalog';

const json = (data, status = 200) => NextResponse.json(data, { status });
const genericLoginError = 'Invalid email or password.';

function slugify(value) { return `${value || 'creatora'}-${Math.random().toString(36).slice(2, 8)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'); }
function publicUser(user) { return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, status: user.status, accountType: user.accountType }; }

export async function POST(request, { params }) {
  const { action } = await params;
  if (!['signup', 'resend-verification', 'forgot-password'].includes(action)) return handlePost(request, { params });
  try {
    checkRateLimit(`${action}:${request.headers.get('x-forwarded-for') || 'local'}`, 10);
    const body = await request.clone().json().catch(() => ({}));
    return await deduplicateEmailRequest(action, body, () => handlePost(request, { params }));
  } catch (error) {
    return json({ error: publicErrorMessage(error, 'Authentication request failed.') }, error.message?.includes('Too many') ? 429 : 400);
  }
}

async function handlePost(request, { params }) {
  const { action } = await params;
  const ip = request.headers.get('x-forwarded-for') || 'local';
  try {
    const body = await request.json().catch(() => ({}));
    if (!['signup', 'resend-verification', 'forgot-password'].includes(action)) checkRateLimit(`${action}:${ip}`, action === 'refresh' ? 30 : 10);
    if (action === 'signup') {
      const email = normalizeEmail(body.email);
      assertPassword(body.password, body.passwordConfirmation);
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && !existing.emailVerifiedAt && existing.status === 'PENDING_VERIFICATION') {
        const replacementToken = createOpaqueToken();
        await prisma.$transaction([
          prisma.emailVerificationToken.updateMany({ where: { userId: existing.id, usedAt: null }, data: { usedAt: new Date() } }),
          prisma.emailVerificationToken.create({ data: { userId: existing.id, tokenHash: hashToken(replacementToken), expiresAt: new Date(Date.now() + 86_400_000) } }),
        ]);
        let emailSent = true;
        try { await sendVerificationEmail(existing.email, replacementToken); }
        catch (deliveryError) { emailSent = false; console.error('Verification email could not be resent during signup.', { code: deliveryError.code, message: deliveryError.message }); }
        return json({ user: publicUser(existing), emailSent, message: emailSent ? 'Your account is waiting for verification. We sent a new email.' : 'Your account is waiting for verification, but the email could not be sent. Please try resending it.' });
      }
      if (existing) return json({ error: 'An account with this email already exists.' }, 409);
      const accountType = body.accountType === 'ORGANIZATION' ? 'ORGANIZATION' : 'PERSONAL';
      if (accountType === 'ORGANIZATION' && !String(body.organizationName || '').trim()) return json({ error: 'Organization name is required.' }, 400);
      const passwordHash = await bcrypt.hash(body.password, 12);
      const verificationToken = createOpaqueToken();
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, passwordHash, firstName: String(body.firstName || '').trim() || null, lastName: String(body.lastName || '').trim() || null, accountType } });
        const organizationName = accountType === 'ORGANIZATION' ? body.organizationName.trim() : `${user.firstName || 'My'} Workspace`;
        const organization = await tx.organization.create({ data: { name: organizationName, slug: slugify(organizationName), ownerId: user.id, accountType } });
        await tx.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } });
        const freePlan = planRecordData('free');
        const plan = await tx.plan.upsert({ where: { code: 'free' }, create: freePlan, update: freePlan });
        const billingAccount = accountType === 'ORGANIZATION'
          ? await tx.billingAccount.create({ data: { type: 'ORGANIZATION', organizationId: organization.id } })
          : await tx.billingAccount.create({ data: { type: 'PERSONAL', userId: user.id } });
        await tx.creditWallet.create({ data: { organizationId: organization.id, balance: plan.monthlyCredits, lifetimePurchased: plan.monthlyCredits } });
        await tx.subscription.create({ data: { organizationId: organization.id, billingAccountId: billingAccount.id, planId: plan.id, status: 'TRIALING', billingCycle: 'monthly' } });
        await tx.emailVerificationToken.create({ data: { userId: user.id, tokenHash: hashToken(verificationToken), expiresAt: new Date(Date.now() + 86_400_000) } });
        return { user, organization };
      });
      try {
        await sendVerificationEmail(result.user.email, verificationToken);
      } catch (deliveryError) {
        console.error('Verification email could not be sent after signup.', { code: deliveryError.code, message: deliveryError.message });
        return json({ user: publicUser(result.user), organization: { id: result.organization.id, name: result.organization.name }, emailSent: false, message: 'Account created, but the verification email could not be sent. Please request another email.' }, 201);
      }
      return json({ user: publicUser(result.user), organization: { id: result.organization.id, name: result.organization.name }, emailSent: true, message: 'Account created. Check your email to verify your address.' }, 201);
    }
    if (action === 'login') {
      const email = normalizeEmail(body.email);
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !await bcrypt.compare(String(body.password || ''), user.passwordHash)) return json({ error: genericLoginError }, 401);
      if (['SUSPENDED', 'DELETED'].includes(user.status)) return json({ error: genericLoginError }, 401);
      if (user.status !== 'ACTIVE' && !(process.env.NODE_ENV !== 'production' && process.env.AUTH_ALLOW_UNVERIFIED_IN_DEV === 'true')) return json({ error: 'Verify your email before signing in.' }, 403);
      const mode = body.mode === 'organization' ? 'ORGANIZATION' : 'PERSONAL';
      const memberships = await prisma.organizationMember.findMany({ where: { userId: user.id, status: 'ACTIVE' }, include: { organization: true }, orderBy: { createdAt: 'asc' } });
      let membership = memberships.find((item) => item.organization.accountType === mode);
      if (!membership && process.env.NODE_ENV !== 'production' && process.env.AUTH_ORG_LOGIN_BYPASS === 'true') {
        const fallbackOrg = await prisma.organization.findFirst({ where: { accountType: mode, ownerId: user.id } });
        if (fallbackOrg) {
          membership = await prisma.organizationMember.create({ data: { organizationId: fallbackOrg.id, userId: user.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } });
        }
      }
      if (!membership) return json({ error: mode === 'ORGANIZATION' ? 'No organization is associated with your account. Ask your organization Admin to add your registered email address.' : genericLoginError }, mode === 'ORGANIZATION' ? 404 : 401);
      const { token, session } = await createSession(user, membership.organizationId, membership.role, request);
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await prisma.auditLog.create({ data: { userId: user.id, organizationId: membership.organizationId, action: 'auth.login', entityType: 'User', entityId: user.id, ipAddress: ip, userAgent: request.headers.get('user-agent') } });
      const response = json({ accessToken: await signAccessToken(session), user: publicUser(user), organizationId: membership.organizationId, role: membership.role });
      const cookie = refreshCookie(token); response.cookies.set(cookie.name, cookie.value, cookie.options); return response;
    }
    if (action === 'refresh') {
      const token = await currentRefreshToken(); if (!token) return json({ error: 'Authentication required.' }, 401);
      const { token: nextToken, session } = await rotateSession(token, request);
      const response = json({ accessToken: await signAccessToken(session) }); const cookie = refreshCookie(nextToken); response.cookies.set(cookie.name, cookie.value, cookie.options); return response;
    }
    if (action === 'logout' || action === 'logout-all') {
      const token = await currentRefreshToken();
      if (token) { const session = await prisma.refreshSession.findUnique({ where: { tokenHash: hashToken(token) } }); if (session) await prisma.refreshSession.updateMany({ where: action === 'logout-all' ? { userId: session.userId, revokedAt: null } : { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } }); }
      const response = json({ ok: true }); const cookie = clearRefreshCookie(); response.cookies.set(cookie.name, cookie.value, cookie.options); return response;
    }
    if (action === 'verify-email') {
      const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(String(body.token || '')) } });
      if (!record || record.usedAt || record.expiresAt < new Date()) return json({ error: 'Invalid or expired verification link.' }, 400);
      await prisma.$transaction([prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }), prisma.user.update({ where: { id: record.userId }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } })]); return json({ ok: true });
    }
    if (action === 'resend-verification') {
      const user = await prisma.user.findUnique({ where: { email: normalizeEmail(body.email) } });
      if (user && !user.emailVerifiedAt) { const token = createOpaqueToken(); await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) } }); await sendVerificationEmail(user.email, token); }
      return json({ ok: true, message: 'If an account exists, a verification email will be sent.' });
    }
    if (action === 'forgot-password') {
      const user = await prisma.user.findUnique({ where: { email: normalizeEmail(body.email) } });
      if (user && user.status === 'ACTIVE') {
        const token = createOpaqueToken();
        await prisma.$transaction([
          prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
          prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3_600_000) } }),
        ]);
        try { await sendPasswordResetEmail(user.email, token); }
        catch (deliveryError) { console.error('Password reset email could not be sent.', { code: deliveryError.code, message: deliveryError.message }); }
      }
      return json({ ok: true, message: 'If an account exists, password reset instructions will be sent.' });
    }
    if (action === 'reset-password') {
      assertPassword(body.password, body.passwordConfirmation);
      const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(String(body.token || '')) } });
      if (!record || record.usedAt || record.expiresAt < new Date()) return json({ error: 'Invalid or expired password reset link.' }, 400);
      const passwordHash = await bcrypt.hash(body.password, 12);
      await prisma.$transaction([prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }), prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }), prisma.refreshSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
      const response = json({ ok: true, message: 'Your password has been reset. You can sign in now.' });
      const cookie = clearRefreshCookie(); response.cookies.set(cookie.name, cookie.value, cookie.options); return response;
    }
    if (action === 'change-password') {
      const token = await currentRefreshToken(); if (!token) return json({ error: 'Authentication required.' }, 401);
      const session = await prisma.refreshSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
      if (!session || session.revokedAt) return json({ error: 'Authentication required.' }, 401);
      if (!await bcrypt.compare(String(body.currentPassword || ''), session.user.passwordHash)) return json({ error: genericLoginError }, 401);
      assertPassword(body.password, body.passwordConfirmation);
      await prisma.$transaction([prisma.user.update({ where: { id: session.userId }, data: { passwordHash: await bcrypt.hash(body.password, 12) } }), prisma.refreshSession.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
      const response = json({ ok: true }); const cookie = clearRefreshCookie(); response.cookies.set(cookie.name, cookie.value, cookie.options); return response;
    }
    return json({ error: 'Unsupported authentication action.' }, 404);
  } catch (error) {
    console.error('Authentication request failed:', error.message);
    const unavailable = /prisma|datasource|database|sqlite|postgres|findUnique/i.test(error.message || '');
    return json({ error: publicErrorMessage(error, 'Authentication request failed.') }, unavailable ? 503 : error.message?.includes('Too many') ? 429 : 400);
  }
}

export async function GET(_request, { params }) {
  const { action } = await params;
  if (action !== 'me') return json({ error: 'Not found.' }, 404);
  const token = await currentRefreshToken(); if (!token) return json({ error: 'Authentication required.' }, 401);
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true, organization: true } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return json({ error: 'Authentication required.' }, 401);
  const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: session.organizationId, userId: session.userId } } });
  if (!membership) return json({ error: 'Authentication required.' }, 401);
  const response = json({ accessToken: await signAccessToken({ ...session, role: membership.role }), user: publicUser(session.user), organization: { id: session.organization.id, name: session.organization.name, accountType: session.organization.accountType }, role: membership.role });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
