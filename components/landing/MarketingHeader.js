'use client';

import BrandLogo from '@/components/BrandLogo';
import Link from 'next/link';
import { useState } from 'react';
import AuthRouteWarmup from '@/components/landing/AuthRouteWarmup';

export default function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="cr-header">
      <AuthRouteWarmup />
      <nav className="cr-shell cr-nav" aria-label="Primary navigation">
        <Link href="/" className="cr-brand" aria-label="Creatora AI home">
          <BrandLogo horizontal priority />
        </Link>
        <div className="cr-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#social-publishing">Social publishing</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="cr-nav-actions">
          <Link className="cr-sign-in" href="/login">Sign in</Link>
          <Link className="cr-button cr-button-small" href="/signup">Start creating <span aria-hidden="true">→</span></Link>
        </div>
        <button className="cr-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="cr-mobile-nav" onClick={() => setMenuOpen((open) => !open)}>
          <span /><span /><span />
        </button>
      </nav>
      <div id="cr-mobile-nav" className={'cr-mobile-nav' + (menuOpen ? ' is-open' : '')}>
        <a href="#features" onClick={closeMenu}>Features</a>
        <a href="#how-it-works" onClick={closeMenu}>How it works</a>
        <a href="#social-publishing" onClick={closeMenu}>Social publishing</a>
        <a href="#pricing" onClick={closeMenu}>Pricing</a>
        <div><Link href="/login" onClick={closeMenu}>Sign in</Link><Link className="cr-button" href="/signup" onClick={closeMenu}>Start creating <span aria-hidden="true">→</span></Link></div>
      </div>
    </header>
  );
}

