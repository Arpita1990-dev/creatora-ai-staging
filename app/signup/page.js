"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import PasswordInput from "@/components/PasswordInput";
import AuthVisual from "@/components/AuthVisual";
import BrandLogo from "@/components/BrandLogo";

const PASSWORD_REQUIREMENTS = [
  { key: "length", label: "8 or more characters", test: (v) => v.length >= 8 },
  {
    key: "uppercase",
    label: "One uppercase letter",
    test: (v) => /[A-Z]/.test(v),
  },
  {
    key: "lowercase",
    label: "One lowercase letter",
    test: (v) => /[a-z]/.test(v),
  },
  { key: "number", label: "One number", test: (v) => /[0-9]/.test(v) },
  {
    key: "special",
    label: "One special character",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

export default function Signup() {
  const router = useRouter();
  const [accountType, setAccountType] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState({});
  const [confirmError, setConfirmError] = useState("");

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
      setConfirmError("Passwords do not match");
      return false;
    }
    setConfirmError("");
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
    if (submittingRef.current) return;
    const form = new FormData(event.currentTarget);
    const passwordValue = form.get("password");
    const confirmValue = form.get("passwordConfirmation");

    const isPasswordValid = validatePassword(passwordValue);
    const isConfirmValid = validateConfirm(confirmValue);

    if (!isPasswordValid) {
      setError(
        "Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number and special character.",
      );
      return;
    }
    if (!isConfirmValid) {
      setError("Passwords do not match");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          password: passwordValue,
          passwordConfirmation: confirmValue,
          accountType,
          organizationName: form.get("organizationName"),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Account creation failed.");
      if (result.emailSent === false) throw new Error(result.message || "Account created, but the verification email could not be sent. Please try again.");
      router.push(
        `/check-email?email=${encodeURIComponent(form.get("email"))}`,
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  if (!accountType) {
    return (
      <main className="auth-page auth-landing">
        <AuthVisual />
        <section className="auth-form">
          <Link href="/" className="auth-logo" aria-label="Creatora AI home">
            <BrandLogo priority />
          </Link>
          <div>
            <span className="section-kicker">START CREATING</span>
            <h1>How will you use Createora?</h1>
            <p>
              Choose the account type that fits how you&apos;ll create content.
            </p>
            <div className="account-type-grid">
              <button
                type="button"
                className="account-type-card"
                onClick={() => setAccountType("PERSONAL")}
              >
                <b>Personal</b>
                <span>Create your individual Createora account.</span>
              </button>
              <button
                type="button"
                className="account-type-card"
                onClick={() => setAccountType("ORGANIZATION")}
              >
                <b>Create an Organization</b>
                <span>Set up Createora for your company or team.</span>
              </button>
            </div>
            <p className="switch-auth">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </div>
        </section>
      </main>
    );
  }
  return (
    <main className="auth-page auth-landing">
      <AuthVisual />
      <section className="auth-form">
        <Link href="/" className="auth-logo" aria-label="Creatora AI home">
          <BrandLogo priority />
        </Link>
        <div>
          <span className="section-kicker">START CREATING</span>
          <h1>
            {accountType === "ORGANIZATION"
              ? "Create your organization"
              : "Create your free account"}
          </h1>
          <p>
            {accountType === "ORGANIZATION"
              ? "Set up the shared workspace your team will use."
              : "Set up your workspace in less than two minutes."}
          </p>
          <button
            type="button"
            className="link-back"
            onClick={() => setAccountType("")}
          >
            &larr; Change account type
          </button>
          <form onSubmit={submit}>
            {accountType === "ORGANIZATION" && (
              <label>
                Organization name
                <input
                  name="organizationName"
                  placeholder="ABC Marketing"
                  required
                />
              </label>
            )}
            <div className="two-fields">
              <label>
                {accountType === "ORGANIZATION"
                  ? "Admin first name"
                  : "First name"}
                <input
                  name="firstName"
                  placeholder="Arpita"
                  autoComplete="given-name"
                  required
                />
              </label>
              <label>
                Last name
                <input
                  name="lastName"
                  placeholder="Das"
                  autoComplete="family-name"
                  required
                />
              </label>
            </div>
            <label>
              {accountType === "ORGANIZATION" ? "Work email" : "Email address"}
              <input
                name="email"
                type="email"
                placeholder="you@gmail.com"
                autoComplete="email"
                required
              />
            </label>
            <PasswordInput
              name="password"
              label="Password"
              placeholder="Create a strong password"
              autoComplete="new-password"
              value={password}
              onChange={handlePasswordChange}
              error={
                passwordErrors.length ||
                passwordErrors.uppercase ||
                passwordErrors.lowercase ||
                passwordErrors.number ||
                passwordErrors.special
                  ? "Password does not meet all requirements"
                  : ""
              }
            />
            {password && (
              <ul className="password-requirements">
                {PASSWORD_REQUIREMENTS.map((req) => (
                  <li
                    key={req.key}
                    className={
                      passwordErrors[req.key]
                        ? "requirement-unmet"
                        : "requirement-met"
                    }
                  >
                    {passwordErrors[req.key] ? "○" : "✓"} {req.label}
                  </li>
                ))}
              </ul>
            )}
            <PasswordInput
              name="passwordConfirmation"
              label="Confirm password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={handleConfirmChange}
              error={confirmError}
            />
            {confirmPassword && !confirmError && (
              <p className="password-match-success">✓ Passwords match</p>
            )}
            {error && (
              <p className="auth-status error" role="alert">
                {error}
              </p>
            )}
            <button className="button" disabled={submitting}>
              {submitting ? "Creating account..." : "Create Account →"}
            </button>
          </form>
          <p className="switch-auth">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
