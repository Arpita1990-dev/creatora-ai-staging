import bcrypt from 'bcryptjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authCookieOptions, createOpaqueToken, createSession, refreshCookie } from '@/lib/auth';
import { planRecordData } from '@/lib/planCatalog';
import { getAppUrl } from '@/lib/appUrl';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const STATE_COOKIE = 'creatora_google_oauth_state';
const NONCE_COOKIE = 'creatora_google_oauth_nonce';
const NEXT_COOKIE = 'creatora_google_oauth_next';

function slugify(value) { return `${value || 'creatora'}-${crypto.randomUUID().slice(0, 8)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'); }
function safeNext(value) { return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'; }

function redirectWithClearedCookies(url, request) {
  const response = NextResponse.redirect(url);
  const expired = { ...authCookieOptions(), maxAge: 0 };
  response.cookies.set(STATE_COOKIE, '', expired);
  response.cookies.set(NONCE_COOKIE, '', expired);
  response.cookies.set(NEXT_COOKIE, '', expired);
  return response;
}

async function resolveGoogleUser(claims) {
  const account = await prisma.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider: 'google', providerAccountId: claims.sub } }, include: { user: true } });
  if (account) return account.user;
  const email = String(claims.email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (['SUSPENDED', 'DELETED'].includes(existing.status)) throw new Error('This account is unavailable.');
    const user = await prisma.user.update({ where: { id: existing.id }, data: { status: 'ACTIVE', emailVerifiedAt: existing.emailVerifiedAt || new Date(), avatarUrl: existing.avatarUrl || claims.picture || null } });
    await prisma.oAuthAccount.create({ data: { userId: user.id, provider: 'google', providerAccountId: claims.sub, email } });
    return user;
  }
  const passwordHash = await bcrypt.hash(createOpaqueToken(), 12);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash, firstName: claims.given_name || claims.name?.split(' ')[0] || null, lastName: claims.family_name || null, avatarUrl: claims.picture || null, status: 'ACTIVE', emailVerifiedAt: new Date(), accountType: 'PERSONAL' } });
    const organization = await tx.organization.create({ data: { name: `${user.firstName || 'My'} Workspace`, slug: slugify(user.firstName), ownerId: user.id, accountType: 'PERSONAL' } });
    await tx.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } });
    const freePlan = planRecordData('free');
    const plan = await tx.plan.upsert({ where: { code: 'free' }, create: freePlan, update: freePlan });
    const billingAccount = await tx.billingAccount.create({ data: { type: 'PERSONAL', userId: user.id } });
    await tx.creditWallet.create({ data: { organizationId: organization.id, balance: plan.monthlyCredits, lifetimePurchased: plan.monthlyCredits } });
    await tx.subscription.create({ data: { organizationId: organization.id, billingAccountId: billingAccount.id, planId: plan.id, status: 'TRIALING', billingCycle: 'monthly' } });
    await tx.oAuthAccount.create({ data: { userId: user.id, provider: 'google', providerAccountId: claims.sub, email } });
    return user;
  });
}

export async function GET(request) {
  const appUrl = getAppUrl();
  const loginError = (message) => redirectWithClearedCookies(new URL(`/login?error=${encodeURIComponent(message)}`, appUrl), request);
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('error')) return loginError('Google sign-in was cancelled.');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expectedState = request.cookies.get(STATE_COOKIE)?.value;
    const nonce = request.cookies.get(NONCE_COOKIE)?.value;
    if (!code || !state || !expectedState || state !== expectedState || !nonce) throw new Error('The Google sign-in request expired. Please try again.');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Google sign-in is not configured.');
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', appUrl).toString();
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.id_token) throw new Error('Google could not complete sign-in.');
    const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, { audience: clientId, issuer: ['https://accounts.google.com', 'accounts.google.com'] });
    if (payload.nonce !== nonce || !payload.sub || !payload.email || payload.email_verified !== true) throw new Error('Google did not return a verified identity.');
    const user = await resolveGoogleUser(payload);
    const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (!membership) throw new Error('No active workspace was found for this account.');
    const { token } = await createSession(user, membership.organizationId, membership.role, request);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: membership.organizationId, action: 'auth.login.google', entityType: 'User', entityId: user.id, ipAddress: request.headers.get('x-forwarded-for'), userAgent: request.headers.get('user-agent') } });
    const destination = new URL(safeNext(request.cookies.get(NEXT_COOKIE)?.value), appUrl);
    const response = redirectWithClearedCookies(destination, request);
    const cookie = refreshCookie(token);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    console.error('Google sign-in failed:', error.message);
    return loginError(error.message || 'Google sign-in failed.');
  }
}
