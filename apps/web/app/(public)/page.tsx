import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Panel } from '@/components/hud/primitives';
import { HeroVideo } from '@/components/landing/hero-video';
import { Button } from '@/components/ui/button';
import MEDIA from '@/public/landing/manifest.json';

// Landing (DESIGN §11.1). Every image is a crop of the real simulator, recorded
// by scripts/record-landing.ts; every claim is something the demo shows.

interface Shot {
  /** File name in public/landing (sizes from manifest.json, written by the recorder). */
  src: keyof typeof MEDIA;
  alt: string;
}

const CHAIN: { n: string; stage: string; line: string; shot: Shot }[] = [
  {
    n: '01',
    stage: 'Detect',
    line: 'The radar paints new tracks. A bird flock looks much like a small drone at first.',
    shot: {
      src: 'chain-detect',
      alt: 'Radar PPI with a cluster of unknown tracks and an RF strobe',
    },
  },
  {
    n: '02',
    stage: 'Track',
    line: 'Every track with range, bearing, altitude band and any RF link heard on it.',
    shot: {
      src: 'chain-track',
      alt: 'Track list with classes, ranges, bearings and RF bands',
    },
  },
  {
    n: '03',
    stage: 'Identify',
    line: 'Cue the EO/IR camera from the radar. Whether you can identify depends on range and zoom.',
    shot: {
      src: 'chain-identify',
      alt: 'EO camera view with the tracker gate on a small drone',
    },
  },
  {
    n: '04',
    stage: 'Decide',
    line: 'ROE and effector state gate each response, and the console says why a control is off.',
    shot: {
      src: 'chain-decide',
      alt: 'Action bar with intercept disabled: ROE weapons tight, declare the track hostile first',
    },
  },
  {
    n: '05',
    stage: 'Respond',
    line: 'Jam, spoof or intercept. Every order and its outcome is logged, misses included.',
    shot: {
      src: 'chain-respond',
      alt: 'Comms log: intercept ordered, missed, ordered again, neutralised',
    },
  },
  {
    n: '06',
    stage: 'Assess',
    line: 'The server scores the event log against a versioned decision tree.',
    shot: {
      src: 'chain-assess',
      alt: 'Score panel with detection, classification and decision bars',
    },
  },
];

const REALISM: { title: string; body: string; source: ReactNode; shot: Shot }[] = [
  {
    title: 'Real terrain, line of sight',
    body: 'Presets are built from 30 m elevation data. Ridges hide low drones from the radar and the camera until they clear them.',
    source:
      'Copernicus DEM GLO-30 (© DLR / Airbus, provided under COPERNICUS by the EU and ESA); straight-line terrain masking.',
    shot: {
      src: 'realism-terrain',
      alt: 'Mountain valley preset in the tactical view with effector range rings',
    },
  },
  {
    title: 'Night and thermal',
    body: 'Day or night follows the real sun at the preset. At night only the thermal camera can identify, and only close enough.',
    source:
      'Sun position: suncalc (Astronomy Answers formulas). Identification: Johnson criteria (J. Johnson, 1958).',
    shot: {
      src: 'realism-night-ir',
      alt: 'Thermal (white-hot) EO view at night with the cue box on a track',
    },
  },
  {
    title: 'Silent links',
    body: 'A fibre-optic FPV emits nothing: the RF detector stays empty and jamming does nothing. Only radar and camera find it.',
    source:
      'Public reporting of fibre-optic FPV use from 2024; A. Holland Michel, Counter-Drone Systems (2019).',
    shot: {
      src: 'realism-silent',
      alt: 'RF panel: no emissions heard while five radar tracks are active',
    },
  },
  {
    title: 'False contacts',
    body: 'Bird flocks, friendly patrol drones and civilian hobby drones share the sky with the threat.',
    source:
      'Bird clutter in C-UAS radar: Holland Michel (2019); V. C. Chen, The Micro-Doppler Effect in Radar (2011). Flocking: Reynolds boids (1987).',
    shot: {
      src: 'realism-false-contacts',
      alt: 'Radar PPI with a bird flock of unknown tracks beside a drone track',
    },
  },
];

function Crop({ shot, sizes }: { shot: Shot; sizes: string }) {
  return (
    <Image
      src={`/landing/${shot.src}.png`}
      width={MEDIA[shot.src].w}
      height={MEDIA[shot.src].h}
      alt={shot.alt}
      sizes={sizes}
      unoptimized
      className="h-auto w-full border border-line-1 bg-bg-1"
    />
  );
}

function SectionTitle({ id, label, title }: { id?: string; label: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-16 space-y-1">
      <p className="text-label">{label}</p>
      <h2 className="text-h1">{title}</h2>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="space-y-16 pb-8">
      {/* 1. Hero: the real simulator, a plain statement. */}
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <p className="text-label">Smart India Hackathon 2026 · PS 26247 · Ministry of Defence</p>
          <h1 className="text-display">
            Counter-drone decision training on real terrain, in a browser.
          </h1>
          <p className="text-body text-text-2">
            Trainees detect, track, identify and respond to drones and swarms among birds and
            friendly traffic, by day and night, under rules of engagement. Every action is logged
            and scored on the server.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="primary">
              <Link href="/login">Sign in to train</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="#measurement">How scoring works</Link>
            </Button>
          </div>
        </div>
        <figure className="space-y-2">
          <HeroVideo />
          <figcaption className="text-small text-text-3">
            Recorded from the simulator: scenario S14 Mixed Sky, played by the scripted defender.
          </figcaption>
        </figure>
      </section>

      {/* 2. The kill chain, each stage a real crop. */}
      <section className="space-y-6">
        <SectionTitle
          label="The loop"
          title="Detect → Track → Identify → Decide → Respond → Assess"
        />
        <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CHAIN.map((c) => (
            <li key={c.n} className="flex flex-col gap-2">
              <p className="flex items-baseline gap-2">
                <span className="text-readout text-text-3">{c.n}</span>
                <span className="text-panel-title text-text-1">{c.stage}</span>
              </p>
              <div className="flex min-h-48 items-start bg-bg-1">
                <Crop shot={c.shot} sizes="(min-width: 1024px) 400px, 100vw" />
              </div>
              <p className="text-body text-text-2">{c.line}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 3. Realism, each with its source. */}
      <section className="space-y-6">
        <SectionTitle label="Realism" title="Plausible, and cited" />
        <div className="grid gap-8 md:grid-cols-2">
          {REALISM.map((r) => (
            <figure key={r.title} className="space-y-2">
              <Crop shot={r.shot} sizes="(min-width: 768px) 600px, 100vw" />
              <figcaption className="space-y-1">
                <p className="text-h2">{r.title}</p>
                <p className="text-body text-text-2">{r.body}</p>
                <p className="text-small text-text-3">Source: {r.source}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="text-small text-text-2">
          All drone figures are representative, from public commercial specifications and textbook
          physics; no real system data is used. Full list:{' '}
          <Link href="/sources" className="text-text-1 underline underline-offset-2">
            realism sources
          </Link>
          .
        </p>
      </section>

      {/* 4. Measurement. */}
      <section className="space-y-6">
        <SectionTitle id="measurement" label="Measurement" title="How scoring works" />
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <figure className="space-y-2">
            <Crop
              shot={{
                src: 'measure-result',
                alt: 'Result screen: total, component bars, per-contact table and recommended next difficulty',
              }}
              sizes="(min-width: 1024px) 700px, 100vw"
            />
            <figcaption className="text-small text-text-3">
              Demo data: scenario S01 played by the scripted defender and scored by the API.
            </figcaption>
          </figure>
          <ol className="space-y-4">
            {[
              'Every trainee action is an event with a sim timestamp. The browser never computes a score.',
              'When a session ends, the server checks the log is plausible and runs it through a versioned decision tree: detection, classification and decision.',
              'Penalties mark the costly errors (firing on a friendly, jamming one) and every line explains itself. A threat nobody could have stopped in time is not held against you.',
            ].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-readout text-text-3">{i + 1}</span>
                <p className="text-body">{line}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5. Deployability: plain facts only. */}
      <section className="space-y-6">
        <SectionTitle label="Deployability" title="Runs where units train" />
        <Panel>
          <dl className="grid gap-x-8 gap-y-4 p-4 md:grid-cols-2">
            {[
              [
                'Browser only',
                'Chrome or Edge, no install and no plug-ins. The simulation runs in the browser; the server stores events and scores.',
              ],
              [
                'Integrated graphics',
                'S14 measured at 78–91 fps at 1920×1000 on an AMD Radeon integrated GPU (Ryzen 7 5800H). Budget: 30 fps.',
              ],
              [
                'Small downloads',
                'Each terrain preset is under 1 MB; fonts and terrain are served by the app itself, with no third-party CDN.',
              ],
              [
                'Keyboard first',
                'Every core action has a shortcut; the console fits a 1366×768 laptop screen.',
              ],
            ].map(([k, v]) => (
              <div key={k} className="space-y-1">
                <dt className="text-panel-title text-text-1">{k}</dt>
                <dd className="text-body text-text-2">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </section>

      {/* 6. Footer. */}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line-1 pt-6">
        <p className="text-small text-text-2">
          Team Synac Syndicate · Smart India Hackathon 2026 · PS 26247 (Ministry of Defence)
        </p>
        <nav className="flex gap-4 text-small">
          <Link href="/sources" className="text-text-2 hover:text-text-1">
            Realism sources
          </Link>
          <Link href="/login" className="text-text-2 hover:text-text-1">
            Sign in
          </Link>
        </nav>
      </footer>
    </div>
  );
}
