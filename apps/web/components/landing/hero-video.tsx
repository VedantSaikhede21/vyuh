'use client';

import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import { prefersReducedMotion } from '@/lib/settings';

const POSTER = '/landing/hero-poster.webp';

/**
 * Hero clip recorded from the simulator (scripts/record-landing.ts). Muted
 * loop; with prefers-reduced-motion it does not autoplay and shows the poster
 * with controls instead (DESIGN §7). The poster is the page's largest paint, so
 * it is preloaded first; the clip is fetched only once the page has loaded, so
 * it never competes with the poster, fonts and scripts (Phase 6F).
 */
export function HeroVideo() {
  preload(POSTER, { as: 'image', fetchPriority: 'high' });
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(prefersReducedMotion());
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (reduced !== false) return;
    // play() rejects if the browser refuses autoplay: the poster stays, which is fine.
    const start = () => void ref.current?.play().catch(() => undefined);
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => window.removeEventListener('load', start);
  }, [reduced]);
  return (
    <video
      ref={ref}
      key={String(reduced)}
      className="aspect-video w-full border border-line-1 bg-bg-1"
      src="/landing/hero.webm"
      poster={POSTER}
      muted
      loop
      playsInline
      controls={reduced === true}
      preload="none"
      aria-label="Recording of the simulator: a hostile quadcopter is detected on radar, identified on the EO camera and intercepted, while a friendly drone sits in the same jam sector."
    />
  );
}
