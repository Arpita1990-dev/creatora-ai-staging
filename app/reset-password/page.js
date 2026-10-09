'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import PasswordInput from '@/components/PasswordInput';
import BrandLogo from '@/components/BrandLogo';

const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: '8 or more characters', test: (v) => v.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'lowercase', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { key: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState({ submitting: false, error: '', complete: false });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState({});
  const [confirmError, setConfirmError] = useState('');

  const validatePassword = (value) => {
    const errors = {};
    PASSWORD_REQUIREMENTS.forEach((req) => {
      if (!req.test(value)) errors[req.key] = true;
    });
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateConfirm = (value) => {
    if (value && value !== password) {
      setConfirmError('Passwords do not match');
      return false;
    }
    setConfirmError('');
    return true;
  };

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    validatePassword(value);
    if (confirmPassword) validateConfirm(confirmPassword);
  };

  const handleConfirmChange = (e) => {
    const value = e.target.value;
    setConfirmPassword(value);
    validateConfirm(value);
  };

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const passwordValue = form.get('password');
    const confirmValue = form.get('passwordConfirmation');

    const isPasswordValid = validatePassword(passwordValue);
    const isConfirmValid = validateConfirm(confirmValue);

    if (!isPasswordValid) {
      setState({ submitting: false, error: 'Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.', complete: false });
      return;
    }
    if (!isConfirmValid) {
      setState({ submitting: false, error: 'Passwords do not match', complete: false });
      return;
    }

    setState({ submitting: true, error: '', complete: false });
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: passwordValue, passwordConfirmation: confirmValue }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to reset your password.');
      setState({ submitting: false, error: '', complete: true });
    } catch (error) {
      setState({ submitting: false, error: error.message, complete: false });
    }
  };

  if (!token) return <><span className="section-kicker">INVALID LINK</span><h1>This reset link is incomplete</h1><p>Request a new password reset email to continue.</p><Link className="button auth-primary-link" href="/forgot-password">Request a new link</Link></>;
  if (state.complete) return <><span className="section-kicker">PASSWORD UPDATED</span><h1>Your password has been reset</h1><p>You can now sign in with your new password. Existing sessions have been signed out.</p><Link className="button auth-primary-link" href="/login">Continue to sign in →</Link></>;

  return <><span className="section-kicker">ACCOUNT RECOVERY</span><h1>Choose a new password</h1><p>Use at least 8 characters with uppercase, lowercase, number and special character.</p><form onSubmit={submit}><PasswordInput name="password" label="New password" placeholder="Create a strong password" autoComplete="new-password" value={password} onChange={handlePasswordChange} error={passwordErrors.length || passwordErrors.uppercase || passwordErrors.lowercase || passwordErrors.number || passwordErrors.special ? 'Password does not meet all requirements' : ''}/>{password && <ul className="password-requirements">{PASSWORD_REQUIREMENTS.map((req) => <li key={req.key} className={passwordErrors[req.key] ? 'requirement-unmet' : 'requirement-met'}>{passwordErrors[req.key] ? '○' : '✓'} {req.label}</li>)}</ul>}<PasswordInput name="passwordConfirmation" label="Confirm new password" placeholder="Repeat your new password" autoComplete="new-password" value={confirmPassword} onChange={handleConfirmChange} error={confirmError}/>{confirmPassword && !confirmError && <p className="password-match-success">✓ Passwords match</p>}{state.error && <p className="auth-status error" role="alert">{state.error}</p>}<button className="button" disabled={state.submitting}>{state.submitting ? 'Resetting...' : 'Reset password →'}</button></form></>;
}

export default function ResetPasswordPage() {
  return <main className="auth-page auth-page-centered"><section className="auth-form auth-card verification-email-card"><Link href="/" className="brand" aria-label="Creatora AI home"><BrandLogo priority /></Link><div><Suspense fallback={<h1>Loading...</h1>}><ResetPasswordForm/></Suspense></div></section></main>;
}
