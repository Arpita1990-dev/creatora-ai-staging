"use client";

import { useRef } from 'react';
import { reviews } from './landingData';

export default function LandingReviews() {
  const railRef = useRef(null);

  const move = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
    const atStart = rail.scrollLeft <= 4;
    if (direction > 0 && atEnd) return rail.scrollTo({ left: 0, behavior: 'smooth' });
    if (direction < 0 && atStart) return rail.scrollTo({ left: rail.scrollWidth, behavior: 'smooth' });
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className="cr-section cr-reviews" id="reviews">
      <div className="cr-shell">
        <div className="cr-reviews-head">
          <div>
            <span className="cr-eyebrow">Loved by creators and teams</span>
            <h2>What our customers<br /><em>say about Creatora</em></h2>
          </div>
          <div className="cr-reviews-nav">
            <button type="button" className="cr-carousel-arrow" onClick={() => move(-1)} aria-label="Previous reviews"><span aria-hidden="true">←</span></button>
            <button type="button" className="cr-carousel-arrow" onClick={() => move(1)} aria-label="Next reviews"><span aria-hidden="true">→</span></button>
          </div>
        </div>
        <div className="cr-review-rail" ref={railRef} aria-label="Customer reviews">
          {reviews.map((review) => (
            <figure className="cr-review-card" key={review.name}>
              <div className="cr-review-stars" aria-label="5 out of 5 stars">★★★★★</div>
              <blockquote>&ldquo;{review.quote}&rdquo;</blockquote>
              <figcaption>
                <span className="cr-review-avatar" aria-hidden="true">{review.name.split(' ').map((part) => part[0]).join('')}</span>
                <span><b>{review.name}</b><small>{review.role}</small></span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
