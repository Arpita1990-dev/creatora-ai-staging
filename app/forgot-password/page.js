'use client';

import Link from 'next/link';
import { useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import AuthVisual from '@/components/AuthVisual';

export default function ForgotPasswordPage() {
  const [state, setState] = useState({ submitting: false, error: '', message: '' });

  const submit = async (event) => {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    setState({ submitting: true, error: '', message: '' });
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to request a password reset.');
      setState({ submitting: false, error: '', message: result.message });
    } catch (error) {
      setState({ submitting: false, error: error.message, message: '' });
    }
  };

  return (
    <main className="auth-page auth-landing">
      <AuthVisual />
      <section className="auth-form">
        <Link href="/" className="auth-logo" aria-label="Creatora AI home">
          <BrandLogo priority />
        </Link>
        <div>
          <span className="section-kicker">ACCOUNT RECOVERY</span>
          <h1>Forgot your password?</h1>
          <p>Enter your email and we’ll send you a secure reset link valid for one hour.</p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input name="email" type="email" placeholder="you@gmail.com" autoComplete="email" required />
            </label>
            {state.error && <p className="auth-status error" role="alert">{state.error}</p>}
            {state.message && <p className="auth-status success" role="status">{state.message}</p>}
            <button className="button" disabled={state.submitting}>
              {state.submitting ? 'Sending...' : 'Send reset link →'}
            </button>
          </form>
          <p className="switch-auth"><Link href="/login">← Back to sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
