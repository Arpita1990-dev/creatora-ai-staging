import BrandLogo from '@/components/BrandLogo';

export default function LoginLoading() {
  return (
    <main className="auth-page auth-landing auth-loading" aria-busy="true" aria-live="polite">
      <section className="auth-visual auth-loading-visual" aria-hidden="true">
        <BrandLogo priority />
        <div className="auth-loading-copy">
          <span className="auth-loading-line auth-loading-kicker" />
          <span className="auth-loading-line auth-loading-heading" />
          <span className="auth-loading-line auth-loading-heading auth-loading-heading-short" />
        </div>
        <div className="auth-loading-art" />
      </section>
      <section className="auth-form auth-loading-form">
        <BrandLogo priority />
        <div>
          <span className="section-kicker">WELCOME BACK</span>
          <h1>Preparing your sign in...</h1>
          <p>Your workspace will be ready in a moment.</p>
          <div className="auth-loading-options" aria-hidden="true">
            <span />
            <span />
          </div>
        </div>
      </section>
    </main>
  );
}
