import Image from 'next/image';
import Link from 'next/link';
import { DemoBadge, SheetFrame, TelemetryStrip } from '@/components/hud/primitives';
import { ChainExplorer } from '@/components/landing/chain-explorer';
import { HeroVideo } from '@/components/landing/hero-video';
import { Button } from '@/components/ui/button';
import { env } from '@/lib/env';
import { DEPLOY, HERO, REALISM, imageSize, imageSrc, latLon, type ImageKey } from '@/lib/landing';

// Landing (DESIGN §11.1, Phase 6C): a printed briefing pack in six sheets. The
// hero is the product itself; every picture is a crop of the real simulator and
// every number a recorded measurement.

const REF = 'PS 26247 · Ministry of Defence · DSSC';
const SHEETS = 6;

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
          <Button asChild variant="primary" className="min-h-11">
            <Link href="/demo">Try the demo</Link>
          </Button>
          <Button asChild variant="secondary" className="min-h-11">
            <Link href="/login">Sign in</Link>
          </Button>
        </>
      ) : (
        <>
          <Button asChild variant="primary" className="min-h-11">
            <Link href="/login">Sign in to train</Link>
          </Button>
          <Button asChild variant="secondary" className="min-h-11">
            <Link href="#measurement">How scoring works</Link>
          </Button>
        </>
      )}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="space-y-16 pb-8 md:space-y-24">
      {/* 01 Hero: the statement and the real simulator. */}
      <SheetFrame sheet={1} of={SHEETS} reference={REF} className="border-t-0 pt-0">
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-6">
            <h1 className="text-display-xl text-text-1">
              Detect.
              <br />
              Identify.
              <br />
              Decide.
            </h1>
            <div className="space-y-3">
              <p className="text-h2 text-text-1 [text-wrap:balance]">
                Counter-drone decision training on real terrain, in a browser.
              </p>
              <p className="max-w-prose-ui text-body text-text-body">
                Trainees detect, track, identify and respond to drones and swarms among birds and
                friendly traffic, by day and night, under rules of engagement. Every action is
                logged and scored on the server, and every session can be replayed.
              </p>
            </div>
            <Actions />
          </div>
          <figure className="min-w-0 space-y-2">
            <HeroVideo />
            <TelemetryStrip
              aria-label="Recorded scenario"
              items={[
                { label: 'Scenario', value: `${HERO.scenario} ${HERO.name}` },
                { label: 'Preset', value: HERO.preset },
                { value: latLon(HERO.lat, HERO.lon) },
                { value: `${HERO.date} ${HERO.time} LT` },
                { label: 'ROE', value: HERO.roe.replace('_', ' ') },
                { label: 'Vis', value: `${HERO.visibilityKm} km` },
                { label: 'Contacts', value: HERO.contacts },
              ]}
            />
            <figcaption className="text-small text-text-2">
              Recorded from the simulator, played by the scripted defender.
            </figcaption>
          </figure>
        </div>
      </SheetFrame>

      {/* 02 The kill chain, one real crop per stage. */}
      <SheetFrame
        sheet={2}
        of={SHEETS}
        reference={REF}
        title="The whole kill chain, every run"
        aria-label="The kill chain"
      >
        <ChainExplorer />
      </SheetFrame>

      {/* 03 Realism as a ruled table with its sources. */}
      <SheetFrame
        sheet={3}
        of={SHEETS}
        reference={REF}
        title="Plausible, and cited"
        aria-label="Realism"
      >
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
          <div className="overflow-x-auto border border-line-1">
            <table className="w-full min-w-[40rem] border-collapse" data-testid="realism">
              <thead>
                <tr className="bg-bg-2 text-left">
                  <th className="h-8 px-3 text-label font-medium">Condition</th>
                  <th className="h-8 px-3 text-label font-medium">What the trainee faces</th>
                  <th className="h-8 px-3 text-label font-medium">Model or data</th>
                  <th className="h-8 px-3 text-label font-medium">Source</th>
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <figure className="space-y-1.5">
              <Crop
                src="realism-terrain"
                alt="Mountain valley preset in the tactical view with effector range rings"
                sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
              />
              <figcaption className="text-small text-text-2">
                Real elevation: a valley preset built from Copernicus DEM GLO-30.
              </figcaption>
            </figure>
            <figure className="space-y-1.5">
              <Crop
                src="realism-night-ir"
                alt="Thermal (white-hot) EO view at night with the cue box on a track"
                sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
              />
              <figcaption className="text-small text-text-2">
                Night: only the thermal camera identifies, and only close enough.
              </figcaption>
            </figure>
          </div>
        </div>
        <p className="mt-4 max-w-prose-ui text-small text-text-2">
          All drone figures are representative, from public commercial specifications and textbook
          physics; no real system data is used.{' '}
          <Link href="/sources" className="text-text-1 underline underline-offset-2">
            Every source, with its licence
          </Link>
          .
        </p>
      </SheetFrame>

      {/* 04 Measurement. */}
      <SheetFrame
        sheet={4}
        of={SHEETS}
        reference={REF}
        title="Scored on the server, reviewed after"
        id="measurement"
        className="scroll-mt-16"
      >
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
            />
          </figure>
          <ol className="space-y-5">
            {[
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
            ].map(([head, body], i) => (
              <li key={head} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
                <span className="text-readout text-text-2">{String(i + 1).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <p className="text-body font-medium text-text-1">{head}</p>
                  <p className="max-w-prose-ui text-body text-text-body">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </SheetFrame>

      {/* 05 Deployability: facts true today. */}
      <SheetFrame
        sheet={5}
        of={SHEETS}
        reference={REF}
        title="Runs where units train"
        aria-label="Deployability"
      >
        <dl className="grid gap-px border border-line-1 bg-line-1 sm:grid-cols-2 xl:grid-cols-4">
          {DEPLOY.map((d) => (
            <div key={d.fact} className="space-y-1.5 bg-bg-1 p-4">
              <dt className="text-panel-title text-text-1">{d.fact}</dt>
              <dd className="text-small text-text-body">{d.detail}</dd>
            </div>
          ))}
        </dl>
      </SheetFrame>

      {/* 06 Footer: facts and references. */}
      <SheetFrame sheet={6} of={SHEETS} reference={REF}>
        <footer className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <p className="text-h2 tracking-[0.2em] text-text-1">VYUH</p>
            <p className="text-small text-text-body">
              Team Synac Syndicate · Smart India Hackathon 2026 · Problem statement 26247, Ministry
              of Defence (Defence Services Staff College).
            </p>
            <p className="max-w-prose-ui text-small text-text-2">
              Terrain: Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space
              GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA. Buildings ©
              OpenStreetMap contributors and Microsoft, ODbL.
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
      </SheetFrame>
    </div>
  );
}
