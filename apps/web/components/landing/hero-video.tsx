'use client';

import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '@/lib/settings';

/**
 * Hero clip recorded from the simulator (scripts/record-landing.ts). Muted
 * loop; with prefers-reduced-motion it does not autoplay and shows the poster
 * with controls instead (DESIGN §7).
 */
export function HeroVideo() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(prefersReducedMotion());
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return (
    <video
      key={String(reduced)}
      className="aspect-video w-full border border-line-1 bg-bg-1"
      src="/landing/hero.webm"
      poster="/landing/hero-poster.png"
      muted
      loop
      playsInline
      autoPlay={reduced === false}
      controls={reduced === true}
      preload="metadata"
      aria-label="Recording of the simulator: a hostile quadcopter is detected on radar, identified on the EO camera and intercepted, while a friendly drone sits in the same jam sector."
    />
  );
}
