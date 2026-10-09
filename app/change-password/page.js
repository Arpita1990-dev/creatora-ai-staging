'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PasswordInput from '@/components/PasswordInput';

const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: '8 or more characters', test: (v) => v.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'lowercase', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { key: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
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
    const currentPassword = form.get('currentPassword');
    const passwordValue = form.get('password');
    const confirmValue = form.get('passwordConfirmation');

    const isPasswordValid = validatePassword(passwordValue);
    const isConfirmValid = validateConfirm(confirmValue);

    if (!isPasswordValid) {
      setError('Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.');
      return;
    }
    if (!isConfirmValid) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, password: passwordValue, passwordConfirmation: confirmValue }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to change password.');
      setSuccess(true);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return <main className="auth-page auth-page-centered"><section className="auth-form auth-card"><Link href="/" className="brand"><span className="brand-mark">C</span><span>Creatora <b>AI</b></span></Link><div><span className="section-kicker">PASSWORD UPDATED</span><h1>Your password has been changed</h1><p>You have been signed out of all other devices. Use your new password to sign in.</p><Link className="button auth-primary-link" href="/login">Continue to sign in →</Link></div></section></main>;
  }

  return <main className="auth-page auth-page-centered"><section className="auth-form auth-card"><Link href="/" className="brand"><span className="brand-mark">C</span><span>Creatora <b>AI</b></span></Link><div><span className="section-kicker">ACCOUNT SECURITY</span><h1>Change your password</h1><p>Choose a strong password you don&apos;t use elsewhere.</p><form onSubmit={submit}><PasswordInput name="currentPassword" label="Current password" placeholder="Enter your current password" autoComplete="current-password"/><PasswordInput name="password" label="New password" placeholder="Create a strong password" autoComplete="new-password" value={password} onChange={handlePasswordChange} error={passwordErrors.length || passwordErrors.uppercase || passwordErrors.lowercase || passwordErrors.number || passwordErrors.special ? 'Password does not meet all requirements' : ''}/>{password && <ul className="password-requirements">{PASSWORD_REQUIREMENTS.map((req) => <li key={req.key} className={passwordErrors[req.key] ? 'requirement-unmet' : 'requirement-met'}>{passwordErrors[req.key] ? '○' : '✓'} {req.label}</li>)}</ul>}<PasswordInput name="passwordConfirmation" label="Confirm new password" placeholder="Repeat your new password" autoComplete="new-password" value={confirmPassword} onChange={handleConfirmChange} error={confirmError}/>{confirmPassword && !confirmError && <p className="password-match-success">✓ Passwords match</p>}{error && <p className="auth-status error" role="alert">{error}</p>}<button className="button" disabled={submitting}>{submitting ? 'Changing password...' : 'Change password →'}</button></form><p className="switch-auth"><Link href="/dashboard">← Back to dashboard</Link></p></div></section></main>;
}
