'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const [state, setState] = useState({ loading: true, message: '' });
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState({ loading: false, message: 'This verification link is missing its token.' }); return; }
    fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Verification failed.'); return result; })
      .then(() => setState({ loading: false, message: 'Your email is verified. You can sign in now.' }))
      .catch((error) => setState({ loading: false, message: error.message }));
  }, [params]);
  // Keep verification results aligned with the check-email authentication card.
  return <main className="auth-page auth-page-centered"><section className="auth-form auth-card verification-email-card"><Link href="/" className="brand" aria-label="Creatora AI home"><BrandLogo priority /></Link><div><span className="section-kicker">EMAIL VERIFICATION</span><h1>{state.loading ? 'Verifying your email...' : state.message}</h1>{!state.loading && <Link className="button auth-primary-link" href="/login">Continue to sign in</Link>}</div></section></main>;
}
