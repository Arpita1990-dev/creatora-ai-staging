import { NextResponse } from 'next/server';
import { authCookieOptions, createOpaqueToken } from '@/lib/auth';
import { getAppUrl } from '@/lib/appUrl';

const STATE_COOKIE = 'creatora_google_oauth_state';
const NONCE_COOKIE = 'creatora_google_oauth_nonce';
const NEXT_COOKIE = 'creatora_google_oauth_next';

function safeNext(value) {
  const next = String(value || '/dashboard');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function GET(request) {
  const appUrl = getAppUrl();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=Google+sign-in+is+not+configured.', appUrl));
  }
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', appUrl).toString();
  const state = createOpaqueToken();
  const nonce = createOpaqueToken();
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, nonce, prompt: 'select_account' }).toString();
  const response = NextResponse.redirect(authorization);
  const options = { ...authCookieOptions(), maxAge: 600 };
  response.cookies.set(STATE_COOKIE, state, options);
  response.cookies.set(NONCE_COOKIE, nonce, options);
  response.cookies.set(NEXT_COOKIE, safeNext(new URL(request.url).searchParams.get('next')), options);
  return response;
}

