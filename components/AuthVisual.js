'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { PlatformIcon } from '@/components/landing/LandingIcons';
import { platforms, reviews } from '@/components/landing/landingData';

export default function AuthVisual() {
  const railRef = useRef(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const scrollToIndex = (index) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.children[index];
    if (!card) return;
    rail.scrollTo({ left: card.offsetLeft - rail.offsetLeft, behavior: 'smooth' });
  };

  const move = (direction) => {
    const nextIndex = (active + direction + reviews.length) % reviews.length;
    scrollToIndex(nextIndex);
  };

  const syncActive = () => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children);
    if (!cards.length) return;
    const railLeft = rail.scrollLeft;
    let closest = 0;
    let smallestGap = Infinity;
    cards.forEach((card, index) => {
      const gap = Math.abs(card.offsetLeft - rail.offsetLeft - railLeft);
      if (gap < smallestGap) {
        smallestGap = gap;
        closest = index;
      }
    });
    setActive(closest);
  };

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    rail.addEventListener('scroll', syncActive, { passive: true });
    return () => rail.removeEventListener('scroll', syncActive);
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => {
      setActive((current) => {
        const nextIndex = (current + 1) % reviews.length;
        scrollToIndex(nextIndex);
        return nextIndex;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <section className="auth-visual">
      <Link href="/" className="auth-logo" aria-label="Creatora AI home">
        <BrandLogo priority />
      </Link>
      <div className="auth-visual-copy">
        <span className="auth-eyebrow">Create. Publish. Grow.</span>
        <h2>Your next campaign<br/><em>starts here</em></h2>
      </div>
      <div className="auth-art">
        <div className="auth-video-card">
          <video src="/template-stock/beauty.mp4" poster="/landing/showcase/beauty-motion-poster.jpg" autoPlay muted loop playsInline preload="metadata" aria-hidden="true"/>
          <span><small>GENERATED</small><b>Beauty campaign</b><em>Vertical · 9:16</em></span>
        </div>
        <div className="floating-card card-two"><b>✦ 12 assets ready</b><span>Launch campaign</span></div>
      </div>
      <div className="auth-platforms"><span>Publish to</span>{platforms.map((platform) => <div key={platform.id}><i className={'auth-platform auth-' + platform.id}><PlatformIcon platform={platform.id} size={16}/></i>{platform.label}</div>)}</div>
      <div className="auth-reviews" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        <div className="auth-reviews-head">
          <span className="auth-reviews-label">Loved by creators and teams</span>
          <div className="auth-reviews-nav">
            <button type="button" className="auth-review-arrow" onClick={() => move(-1)} aria-label="Previous customer review"><span aria-hidden="true">←</span></button>
            <button type="button" className="auth-review-arrow" onClick={() => move(1)} aria-label="Next customer review"><span aria-hidden="true">→</span></button>
          </div>
        </div>
        <div className="auth-review-rail" ref={railRef} aria-label="Customer reviews">
          {reviews.map((review) => (
            <figure className="auth-review-card" key={review.name}>
              <div className="auth-review-stars" aria-label="5 out of 5 stars">★★★★★</div>
              <blockquote>&ldquo;{review.quote}&rdquo;</blockquote>
              <figcaption>
                <span className="auth-review-avatar" aria-hidden="true">{review.name.split(' ').map((part) => part[0]).join('')}</span>
                <span><b>{review.name}</b><small>{review.role}</small></span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="auth-review-dots">
          {reviews.map((review, index) => (
            <button
              key={review.name}
              type="button"
              className={'auth-review-dot' + (index === active ? ' active' : '')}
              onClick={() => { scrollToIndex(index); setActive(index); }}
              aria-label={`Show review from ${review.name}`}
              aria-current={index === active}
            />
          ))}
        </div>
      </div>
    </section>
  );
}