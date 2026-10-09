'use client';

import Link from 'next/link';
import { useState, useId } from 'react';

export default function PasswordInput({
  name,
  label,
  placeholder = '',
  autoComplete = 'new-password',
  required = true,
  disabled = false,
  error = '',
  showLink = false,
  linkHref = '',
  linkText = '',
  onChange,
  value: controlledValue,
  ...props
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const inputId = `password-${id}`;
  const errorId = `password-error-${id}`;

  return (
    <div className="password-field-wrapper">
      {label && (
        <label htmlFor={inputId}>
          {label}
          {showLink && linkHref && (
            <Link href={linkHref}>{linkText}</Link>
          )}
        </label>
      )}
      <div className={`password-input-wrapper${error ? ' has-error' : ''}${disabled ? ' is-disabled' : ''}`}>
        <input
          id={inputId}
          name={name}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          value={controlledValue}
          onChange={onChange}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={0}
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
      {error && (
        <p className="password-field-error" id={errorId} role="alert">{error}</p>
      )}
    </div>
  );
}
