'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import PasswordInput from '@/components/PasswordInput';
import BrandLogo from '@/components/BrandLogo';
import AuthVisual from '@/components/AuthVisual';

const Logo = () => <Link href="/" className="auth-logo" aria-label="Creatora AI home"><BrandLogo priority /></Link>;

export default function Login() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState('');
  const [error, setError] = useState(searchParams.get('error') || '');
  const [submitting, setSubmitting] = useState(false);
  const next = searchParams.get('next') || '/dashboard';

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password'), mode: mode.toLowerCase() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign in failed.');
      window.location.assign(next);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!mode) {
    return <main className="auth-page auth-landing"><AuthVisual/><section className="auth-form"><Logo/><div><span className="section-kicker">WELCOME BACK</span><h1>How would you like to sign in?</h1><p>Choose Personal or Organization to continue.</p><div className="account-type-grid">
      <button type="button" className="account-type-card" onClick={() => setMode('PERSONAL')}>
        <b>Personal</b>
        <span>Sign in to your personal workspace</span>
      </button>
      <button type="button" className="account-type-card" onClick={() => setMode('ORGANIZATION')}>
        <b>Organization</b>
        <span>Sign in to your team workspace</span>
      </button>
    </div><p className="switch-auth">New to Creatora? <Link href="/signup">Create an account</Link></p></div></section></main>;
  }

  return <main className="auth-page auth-landing"><AuthVisual/><section className="auth-form"><Logo/><div><span className="section-kicker">WELCOME BACK</span><h1>{mode === 'ORGANIZATION' ? 'Organization sign in' : 'Sign in to your studio'}</h1><p>Continue creating campaigns that move your brand forward.</p><button type="button" className="link-back" onClick={() => setMode('')}>&larr; Change account type</button><form onSubmit={submit}><label>{mode === 'ORGANIZATION' ? 'Work email' : 'Email'}<input name="email" type="email" placeholder="you@company.com" autoComplete="email" required/></label><PasswordInput name="password" label="Password" placeholder="Enter your password" autoComplete="current-password" showLink={true} linkHref="/forgot-password" linkText="Forgot password?"/>{error && <p className="auth-status error" role="alert">{error}</p>}<button className="button" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in →'}</button></form>{mode === 'PERSONAL' && <><div className="divider"><span>or continue with</span></div><a className="oauth" href={`/api/auth/google?next=${encodeURIComponent(next)}`} aria-label="Continue with Google"><span className="google-mark" aria-hidden="true">G</span>Continue with Google</a></>}<p className="switch-auth">New to Creatora? <Link href="/signup">Create an account</Link></p></div></section></main>;
}

