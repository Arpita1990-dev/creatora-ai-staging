"use client";

import { useRef, useState } from 'react';
import { showcaseItems } from './landingData';
import { PlayIcon } from './LandingIcons';

export default function LandingShowcase() {
  const railRef = useRef(null);
  const videos = useRef(new Map());
  const [paused, setPaused] = useState(new Set());

  const move = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.72, behavior: 'smooth' });
  };

  const togglePlayback = async (item) => {
    const video = videos.current.get(item.title);
    if (!video) return;
    video.muted = true;
    if (video.paused) {
      try {
        await video.play();
        setPaused((current) => {
          const next = new Set(current);
          next.delete(item.title);
          return next;
        });
      } catch {}
    } else {
      video.pause();
      setPaused((current) => new Set(current).add(item.title));
    }
  };

  return (
    <section className="cr-section cr-showcase" id="showcase">
      <div className="cr-shell">
        <div className="cr-carousel-heading">
          <div>
            <span className="cr-eyebrow">Real motion. Creatora direction.</span>
            <h2>Make any ad video<br /><em>in your brand&apos;s style</em></h2>
          </div>
          <div>
            <p>Explore short-form motion styles for product stories, social campaigns and brand films. Every preview stays muted.</p>
            <a href="#how-it-works">See how Creatora works <span aria-hidden="true">→</span></a>
          </div>
        </div>
        <div className="cr-carousel-wrap">
          <button type="button" className="cr-carousel-arrow previous" onClick={() => move(-1)} aria-label="View previous ad videos"><span aria-hidden="true">←</span></button>
          <div className="cr-video-rail" ref={railRef} aria-label="Short ad video examples">
            {showcaseItems.map((item) => (
              <article className="cr-video-slide" key={item.title}>
                <video
                  ref={(node) => node ? videos.current.set(item.title, node) : videos.current.delete(item.title)}
                  src={item.video}
                  poster={item.poster}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
                  aria-label={`${item.title} muted video preview`}
                  onLoadedData={(event) => { event.currentTarget.muted = true; }}
                  onVolumeChange={(event) => { event.currentTarget.muted = true; }}
                />
                <div className="cr-video-shade" aria-hidden="true" />
                <span className="cr-muted-badge"><i aria-hidden="true">×</i> Sound off</span>
                <button type="button" className="cr-video-toggle" onClick={() => togglePlayback(item)} aria-label={paused.has(item.title) ? `Play ${item.title} preview` : `Pause ${item.title} preview`}>
                  {paused.has(item.title) ? <PlayIcon /> : <span aria-hidden="true">Ⅱ</span>}
                </button>
                <div className="cr-video-caption">
                  <span>{item.category}</span>
                  <h3>{item.title}</h3>
                  <p>{item.style} · {item.ratio}</p>
                  <div>{item.tags.map((tag) => <small key={tag}>{tag}</small>)}</div>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="cr-carousel-arrow next" onClick={() => move(1)} aria-label="View more ad videos"><span aria-hidden="true">→</span></button>
        </div>
        <div className="cr-carousel-foot"><span>Drag or use the arrows to explore</span><div><i /><i /><i /></div></div>
      </div>
    </section>
  );
}

