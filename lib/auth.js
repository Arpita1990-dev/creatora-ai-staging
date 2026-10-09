import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';

const encoder = new TextEncoder();
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'creatora_refresh';
const ACCESS_TTL = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 30);
const rateLimits = new Map();

function accessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('JWT_ACCESS_SECRET must be configured in production.');
  return encoder.encode(secret || 'development-only-secret-change-me');
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(48).toString('base64url');
}

export function assertPassword(password, confirmation) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.');
  if (password.length > 64) throw new Error('Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.');
  if (!/[A-Z]/.test(password)) throw new Error('Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.');
  if (!/[a-z]/.test(password)) throw new Error('Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.');
  if (!/[0-9]/.test(password)) throw new Error('Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.');
  if (!/[^A-Za-z0-9]/.test(password)) throw new Error('Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.');
  if (confirmation !== undefined && password !== confirmation) throw new Error('Password confirmation does not match.');
}

export function checkRateLimit(key, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const bucket = rateLimits.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    rateLimits.set(key, { count: 1, expiresAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) throw new Error('Too many requests. Please try again later.');
  bucket.count += 1;
}

export async function signAccessToken(session) {
  return new SignJWT({ email: session.user.email, organizationId: session.organizationId, role: session.role, sessionId: session.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(accessSecret());
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, accessSecret(), { clockTolerance: 60 });
  return payload;
}

export function refreshCookie(token) {
  return { name: COOKIE_NAME, value: token, options: { ...authCookieOptions(), maxAge: REFRESH_DAYS * 86_400 } };
}

export function clearRefreshCookie() {
  return { name: COOKIE_NAME, value: '', options: { ...authCookieOptions(), maxAge: 0 } };
}

export function authCookieOptions() {
  const override = process.env.AUTH_COOKIE_SECURE;
  const secure = override == null || override === ''
    ? String(process.env.APP_URL || '').startsWith('https://')
    : override === 'true';
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' };
}

export async function createSession(user, organizationId, role, request, tokenFamily = randomUUID()) {
  const token = createOpaqueToken();
  const session = await prisma.refreshSession.create({
    data: {
      userId: user.id, organizationId, tokenHash: hashToken(token), tokenFamily,
      userAgent: request.headers.get('user-agent'), ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      expiresAt: new Date(Date.now() + REFRESH_DAYS * 86_400_000),
    },
  });
  return { token, session: { ...session, user, role } };
}

export async function rotateSession(token, request) {
  const current = await prisma.refreshSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!current || current.expiresAt <= new Date() || current.user.status !== 'ACTIVE') throw new Error('Invalid refresh session.');
  if (current.revokedAt) {
    await prisma.refreshSession.updateMany({ where: { tokenFamily: current.tokenFamily, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new Error('Refresh token reuse detected.');
  }
  const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: current.organizationId, userId: current.userId } } });
  if (!membership || membership.status !== 'ACTIVE') throw new Error('Invalid organization membership.');
  const next = await createSession(current.user, current.organizationId, membership.role, request, current.tokenFamily);
  await prisma.refreshSession.update({ where: { id: current.id }, data: { revokedAt: new Date(), replacedBySessionId: next.session.id, lastUsedAt: new Date() } });
  return next;
}

export async function requireUser(request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication required.');
  try {
    return await verifyAccessToken(authorization.slice(7));
  } catch {
    throw new Error('Authentication required.');
  }
}

export async function requireOrganization(request) {
  const user = await requireUser(request);
  if (!user.organizationId || !user.sub) throw new Error('Organization required.');
  const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: user.organizationId, userId: user.sub } } });
  if (!membership || membership.status !== 'ACTIVE') throw new Error('Organization access denied.');
  return { user, membership };
}

// Internal browser proxies cannot read the in-memory access token used by
// AuthProvider. Authenticate those same-origin requests with the existing
// HttpOnly rotating refresh session without rotating or exposing it.
export async function requireOrganizationSession(request) {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) return requireOrganization(request);

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) throw new Error('Authentication required.');
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
    throw new Error('Authentication required.');
  }
  if (!session.organizationId) throw new Error('Organization required.');
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: session.organizationId, userId: session.userId } },
  });
  if (!membership || membership.status !== 'ACTIVE') throw new Error('Organization access denied.');
  return {
    user: { sub: session.userId, organizationId: session.organizationId, sessionId: session.id },
    membership,
  };
}

export async function requireRole(request, roles) {
  const context = await requireOrganization(request);
  if (!roles.includes(context.membership.role)) throw new Error('Insufficient permission.');
  return context;
}

export const requirePermission = requireRole;

export async function authenticateApiKey(request) {
  const value = request.headers.get('x-api-key');
  if (!value?.startsWith('crt_')) throw new Error('API key required.');
  const keyHash = hashToken(value);
  const key = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) throw new Error('Invalid API key.');
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { organizationId: key.organizationId, scopes: JSON.parse(key.scopes || '[]'), keyId: key.id };
}

export async function currentRefreshToken() {
  return (await cookies()).get(COOKIE_NAME)?.value;
}

export async function requestIp() {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
