'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';

function CheckEmailContent() {
  const params = useSearchParams();
  const email = params.get('email') || '';
  const [state, setState] = useState({ submitting: false, error: '', message: '' });
  const submittingRef = useRef(false);

  const resend = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setState({ submitting: true, error: '', message: '' });
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to resend the verification email.');
      setState({ submitting: false, error: '', message: result.message });
    } catch (error) {
      setState({ submitting: false, error: error.message, message: '' });
    } finally {
      submittingRef.current = false;
    }
  };

  return <><span className="section-kicker">VERIFY YOUR EMAIL</span><h1>Check your inbox</h1><p>We sent a verification link{email ? <> to <strong>{email}</strong></> : ''}. Open it to activate your account.</p>{state.error && <p className="auth-status error" role="alert">{state.error}</p>}{state.message && <p className="auth-status success" role="status">{state.message}</p>}{email && <button className="button auth-primary-link" type="button" onClick={resend} disabled={state.submitting}>{state.submitting ? 'Sending...' : 'Resend verification email'}</button>}<p className="switch-auth"><Link href="/login">Continue to sign in</Link></p></>;
}

export default function CheckEmailPage() {
  return <main className="auth-page auth-page-centered"><section className="auth-form auth-card verification-email-card"><Link href="/" className="brand" aria-label="Creatora AI home"><BrandLogo priority /></Link><div><Suspense fallback={<h1>Loading...</h1>}><CheckEmailContent/></Suspense></div></section></main>;
}
