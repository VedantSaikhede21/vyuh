import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DemoBadge, TelemetryStrip } from '@/components/hud/primitives';
import { ChainExplorer } from '@/components/landing/chain-explorer';
import { Button } from '@/components/ui/button';
import { env } from '@/lib/env';
import { DEPLOY, REALISM, imageSize, imageSrc, type ImageKey } from '@/lib/landing';
import { renderFor } from '@/lib/renders';

// Landing (DESIGN §11.1): a type-only statement, then the product's own imagery.
// Every picture is the real simulator and every number a recorded measurement.

function Crop({
  src,
  alt,
  sizes,
  className,
}: {
  src: ImageKey;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const { w, h } = imageSize(src);
  return (
    <Image
      src={imageSrc(src)}
      width={w}
      height={h}
      alt={alt}
      sizes={sizes}
      unoptimized
      className={className ?? 'h-auto w-full border border-line-1 bg-bg-1'}
    />
  );
}

function Actions() {
  return (
    <div className="flex flex-wrap gap-2">
      {env.guestMode ? (
        <>
          <Button asChild variant="primary" size="lg" className="min-h-11">
            <Link href="/demo">Try the demo</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="min-h-11">
            <Link href="/login">Sign in</Link>
          </Button>
        </>
      ) : (
        <>
          <Button asChild variant="primary" size="lg" className="min-h-11">
            <Link href="/login">Sign in to train</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="min-h-11">
            <Link href="#measurement">How scoring works</Link>
          </Button>
        </>
      )}
    </div>
  );
}

/** A full-width picture band with facts on a scrim: the text never sits on raw imagery. */
function Band({ still, alt, children }: { still: string; alt: string; children: ReactNode }) {
  return (
    <section className="relative left-1/2 ml-[-50vw] flex min-h-[80vh] w-screen items-end overflow-hidden bg-bg-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={renderFor(still).w1920}
        srcSet={`${renderFor(still).w640} 640w, ${renderFor(still).w1920} 1920w`}
        sizes="100vw"
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="relative mx-auto w-full max-w-[1280px] px-4 pb-6 md:px-6 min-[1600px]:max-w-[1440px] min-[1600px]:px-12">
        <div className="max-w-2xl rounded-lg bg-scrim-2 p-5">{children}</div>
      </div>
    </section>
  );
}

const MEASURE: [string, string][] = [
  [
    'Every action is an event.',
    'Each order, classification and report is logged with its sim time. The browser never computes a score.',
  ],
  [
    'A versioned decision tree scores it.',
    'When the session ends, the server checks the log is plausible and scores detection, classification, decision and contact reports, scaled to 100.',
  ],
  [
    'Every point has a reason and a time.',
    'Penalties (firing on a friendly, jamming one) are dated and link into the replay. A threat nobody could have stopped is not held against you.',
  ],
];

export default function LandingPage() {
  return (
    <div className="space-y-24 pb-8 md:space-y-32">
      {/* The statement: type only, so the first paint is the message. */}
      <section className="flex min-h-[calc(100vh-8rem)] flex-col justify-center gap-8">
        <h1 className="text-statement text-text-1">Detect. Identify. Decide.</h1>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-xl text-h2 font-normal text-text-1">
            Counter-drone decision training on real terrain, in a browser. Trainees face drones and
            swarms among birds and friendly traffic, by day and night, under rules of engagement.
          </p>
          <Actions />
        </div>
      </section>

      {/* It is a real place. */}
      <Band
        still="S05"
        alt="A real Himalayan valley in the simulator, with defended site and zones"
      >
        <h2 className="text-h1 text-text-1">Real ground, real sun</h2>
        <p className="mt-2 text-body text-text-1">
          Every preset is built from Copernicus elevation and our own Sentinel-2 composite. Line of
          sight, sun position and weather come from the same data the sensors use.
        </p>
        <TelemetryStrip
          className="mt-3"
          aria-label="Scenario facts"
          items={[
            { label: 'Scenario', value: 'S05 Silent Approach' },
            { label: 'Preset', value: 'JK_MOUNTAIN' },
            { value: '2,431–5,315 m' },
          ]}
        />
      </Band>

      {/* The kill chain, one real crop per stage. */}
      <section aria-label="The kill chain" className="space-y-6">
        <h2 className="text-display text-text-1">The whole kill chain, every run</h2>
        <ChainExplorer />
      </section>

      {/* Realism with its sources. */}
      <section aria-label="Realism" className="space-y-6">
        <h2 className="text-display text-text-1">Plausible, and cited</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="space-y-2">
            <Crop
              src="realism-night-ir"
              alt="Thermal (white-hot) EO view at night with the cue box on a track"
              sizes="(min-width: 768px) 50vw, 100vw"
              className="h-auto w-full rounded-lg bg-bg-1"
            />
            <figcaption className="text-small text-text-body">
              Night: only the thermal camera identifies, and only close enough.
            </figcaption>
          </figure>
          <figure className="space-y-2">
            <Crop
              src="realism-false-contacts"
              alt="Birds and a friendly drone among radar tracks"
              sizes="(min-width: 768px) 50vw, 100vw"
              className="h-auto w-full rounded-lg bg-bg-1"
            />
            <figcaption className="text-small text-text-body">
              Birds and friendly traffic make tracks too. Engaging one costs points.
            </figcaption>
          </figure>
        </div>
        <div className="overflow-x-auto rounded-md bg-bg-1">
          <table className="w-full min-w-[40rem] border-collapse" data-testid="realism">
            <thead>
              <tr className="bg-bg-2 text-left">
                <th className="h-9 px-3 text-label font-medium">Condition</th>
                <th className="h-9 px-3 text-label font-medium">What the trainee faces</th>
                <th className="h-9 px-3 text-label font-medium">Model or data</th>
                <th className="h-9 px-3 text-label font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {REALISM.map((r) => (
                <tr key={r.condition} className="border-t border-line-1 align-top">
                  <th scope="row" className="px-3 py-2.5 text-left text-body font-medium">
                    {r.condition}
                  </th>
                  <td className="px-3 py-2.5 text-small text-text-body">{r.faces}</td>
                  <td className="px-3 py-2.5 text-small text-text-body">{r.model}</td>
                  <td className="px-3 py-2.5 text-small text-text-2">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-prose-ui text-small text-text-2">
          All drone figures are representative, from public commercial specifications and textbook
          physics; no real system data is used.{' '}
          <Link href="/sources" className="text-text-1 underline underline-offset-2">
            Every source, with its licence
          </Link>
          .
        </p>
      </section>

      {/* Measurement. */}
      <section id="measurement" className="scroll-mt-16 space-y-6">
        <h2 className="text-display text-text-1">Scored on the server, reviewed after</h2>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <figure className="space-y-2">
            <div className="flex items-center gap-2">
              <DemoBadge />
              <span className="text-small text-text-2">
                S01 First Contact played by the scripted defender and scored by the API.
              </span>
            </div>
            <Crop
              src="measure-result"
              alt="Result screen: total, component bars, per-contact table and recommended next difficulty"
              sizes="(min-width: 1024px) 720px, 100vw"
              className="h-auto w-full rounded-lg bg-bg-1"
            />
          </figure>
          <ol className="space-y-5">
            {MEASURE.map(([head, body]) => (
              <li key={head} className="space-y-1">
                <p className="text-h3 text-text-1">{head}</p>
                <p className="max-w-prose-ui text-body text-text-body">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Deployability: facts true today. */}
      <section aria-label="Deployability" className="space-y-6">
        <h2 className="text-display text-text-1">Runs where units train</h2>
        <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
          {DEPLOY.map((d) => (
            <div key={d.fact} className="space-y-1">
              <dt className="text-h3 text-text-1">{d.fact}</dt>
              <dd className="text-body text-text-body">{d.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="grid gap-6 border-t border-line-1 pt-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          <p className="text-display tracking-[0.1em] text-text-1">VYUH</p>
          <p className="text-small text-text-body">
            Team Synac Syndicate · Smart India Hackathon 2026 · Problem statement 26247, Ministry of
            Defence (Defence Services Staff College).
          </p>
          <p className="max-w-prose-ui text-small text-text-2">
            Terrain: Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH
            2014–2018, provided under COPERNICUS by the European Union and ESA. Contains modified
            Copernicus Sentinel data, processed by VYUH. Buildings © OpenStreetMap contributors and
            Microsoft, ODbL.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1 md:flex-col">
          <Link
            href="/sources"
            className="flex min-h-11 items-center text-label hover:text-text-1 md:min-h-0"
          >
            Realism sources
          </Link>
          <Link
            href="/status"
            className="flex min-h-11 items-center text-label hover:text-text-1 md:min-h-0"
          >
            System status
          </Link>
          <Link
            href="/login"
            className="flex min-h-11 items-center text-label hover:text-text-1 md:min-h-0"
          >
            Sign in
          </Link>
        </nav>
      </footer>
    </div>
  );
}
