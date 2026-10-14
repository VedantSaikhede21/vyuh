'use client';

import { Scenario } from '@vyuh/shared';
import { TICK_MS, createDefender } from '@vyuh/sim-core';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Skeleton, StatusNotice } from '@/components/hud/primitives';
import { api } from '@/lib/api';
import { useCommands } from '@/lib/sim/commands';
import { SimRuntime } from '@/lib/sim/runtime';
import { snapshot, useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { useSimLoop } from '@/lib/sim/use-sim-loop';
import { loadWorld } from '@/lib/terrain/load-world';
import S01 from '../../../../api/app/seed/scenarios/S01.json';
import S02 from '../../../../api/app/seed/scenarios/S02.json';
import S03 from '../../../../api/app/seed/scenarios/S03.json';
import S11 from '../../../../api/app/seed/scenarios/S11.json';
import S12 from '../../../../api/app/seed/scenarios/S12.json';
import S13 from '../../../../api/app/seed/scenarios/S13.json';
import S14 from '../../../../api/app/seed/scenarios/S14.json';

// Dev-only "hero" route (decision 63): plays a seeded scenario locally with the
// ground-truth defender (decision 68) — no API, no session — for the landing
// recording and screenshot crops. Parameters:
//   s=S14       scenario code
//   t=55        fast-forward to this sim time (s) before showing
//   select=threat|<trackId>  select (and EO-cue) the first threat track or a track id
//   zoom=3      EO zoom steps after cueing     ir=1   thermal
//   tab=rf      open the RF tab                 pause=1  hold the picture (practice pause)
//   defend=0    no defender (the threats are left to the trainee)
//   birds=60    replace the birds with N copies of the first flock bird, in flocks of
//               ten spread around the site (FPS stress case, e2e/fps.spec.ts)
//   submit=1    play to the end with the defender as a real session for the signed-in
//               user (events posted, scored on the server), then open its result page
// window.__vyuhHero = { ready, tMs } reports progress to scripts.

const SCENARIOS: Record<string, unknown> = { S01, S02, S03, S11, S12, S13, S14 };

const SimPlayer = dynamic(() => import('@/components/sim/player').then((m) => m.SimPlayer), {
  ssr: false,
  loading: () => <Skeleton label="Loading 3D view" className="p-6" />,
});

declare global {
  interface Window {
    __vyuhHero?: { ready: boolean; tMs: number };
  }
}

/** Replace the birds with `n` copies of the first one, ten to a flock (deterministic). */
function withBirds(scenario: Scenario, n: number): Scenario {
  const bird = scenario.contacts.find((c) => c.behaviour === 'BIRD_FLOCK');
  if (!bird || n <= 0) return scenario;
  const birds = Array.from({ length: n }, (_, i) => {
    const flock = Math.floor(i / 10);
    const angle = (flock * 2 * Math.PI) / Math.ceil(n / 10);
    const dx = Math.cos(angle) * 1500 - bird.path[0]!.x + (i % 10) * 12;
    const dz = Math.sin(angle) * 1500 - bird.path[0]!.z + (i % 10) * 9;
    return {
      ...bird,
      id: `s${String(i).padStart(2, '0')}`,
      groupId: `sf${flock}`,
      path: bird.path.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz })),
    };
  });
  return Scenario.parse({
    ...scenario,
    contacts: [...scenario.contacts.filter((c) => c.behaviour !== 'BIRD_FLOCK'), ...birds],
  });
}

/** Batch size for posting a finished run (the API accepts ≤ 500 per batch). */
const SUBMIT_BATCH = 400;

/** Real session played by the defender, scored by the API (demo data for the landing page). */
function Submit({ code }: { code: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(`Playing ${code} with the scripted defender`);
  useEffect(() => {
    let live = true;
    (async () => {
      const list = await api.listScenarios();
      const item = list.items.find((s) => s.code === code);
      if (!item) throw new Error(`${code} is not in your scenario list`);
      const { sessionId, scenario } = await api.createSession(item.id, 'PRACTICE');
      const world = await loadWorld(scenario.terrain.preset);
      const runtime = new SimRuntime(scenario, world, 'PRACTICE');
      const defender = createDefender(scenario);
      runtime.beforeTick = () => {
        for (const cmd of defender.step(runtime.sim.getState())) runtime.dispatch(cmd);
      };
      while (!runtime.ended) runtime.advance(TICK_MS);
      const events = runtime.sim.getEvents();
      for (let i = 0, seq = 0; i < events.length; i += SUBMIT_BATCH, seq++) {
        if (live) setStatus(`Uploading events ${i}/${events.length}`);
        await api.postEvents(sessionId, seq, events.slice(i, i + SUBMIT_BATCH));
      }
      await api.completeSession(sessionId, runtime.sim.getState().clock.tMs, {
        browser: 'dev hero route (scripted defender)',
      });
      if (live) router.push(`/train/session/${sessionId}`);
    })().catch((err: unknown) => {
      if (live) setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => {
      live = false;
    };
  }, [code, router]);
  return <Skeleton label={status} className="p-6" />;
}

function Hero() {
  const q = useSearchParams();
  const code = q.get('s') ?? 'S14';
  const [rt, setRt] = useState<SimRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commands = useCommands(rt);
  useSimLoop(q.get('pause') === '1' ? null : rt);

  useEffect(() => {
    let live = true;
    (async () => {
      const raw = SCENARIOS[code];
      if (!raw) throw new Error(`Unknown scenario ${code}`);
      const scenario = withBirds(Scenario.parse(raw), Number(q.get('birds') ?? 0));
      const world = await loadWorld(scenario.terrain.preset);
      const runtime = new SimRuntime(scenario, world, 'PRACTICE');
      if (q.get('defend') !== '0') {
        const defender = createDefender(scenario);
        runtime.beforeTick = () => {
          for (const cmd of defender.step(runtime.sim.getState())) runtime.dispatch(cmd);
        };
      }
      const eo = scenario.sensors.find((s) => s.kind === 'EO_IR');
      useUiStore.getState().reset({
        azDeg: 0,
        elDeg: 0,
        hfovDeg: eo?.kind === 'EO_IR' ? eo.fovDegMax : 30,
        lockTrackId: null,
        mode: 'DAY',
        trackMode: 'MANUAL',
      });
      useHudStore.getState().publish(snapshot(runtime));
      if (live) setRt(runtime);
    })().catch((err: unknown) => {
      if (live) setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      live = false;
    };
  }, [code, q]);

  // After the player mounts (as in a real session, so labels appear after the
  // first render): fast-forward, then selection, EO cue/zoom/mode, tab.
  useEffect(() => {
    if (!rt || !commands) return;
    const target = Number(q.get('t') ?? 55) * 1000;
    while (rt.sim.getState().clock.tMs < target && !rt.ended) rt.advance(TICK_MS);
    useHudStore.getState().publish(snapshot(rt));
    const st = rt.sim.getState();
    const threats = new Set(rt.scenario.contacts.filter((c) => c.isThreat).map((c) => c.id));
    const sel = q.get('select');
    const track =
      sel === 'threat'
        ? st.tracks.find((t) => t.status === 'ACTIVE' && threats.has(t.contactId))
        : sel
          ? st.tracks.find((t) => t.id === sel)
          : undefined;
    if (track) {
      commands.select(track.id);
      setTimeout(() => {
        commands.slewToSelected();
        for (let i = 0; i < Number(q.get('zoom') ?? 0); i++) commands.zoom(1);
        if (q.get('ir') === '1') commands.toggleEoMode();
      }, 120);
    }
    const t = setTimeout(() => {
      // A held picture still needs one tick so the selection and cue apply.
      if (q.get('pause') === '1') {
        rt.advance(TICK_MS);
        useHudStore.getState().publish(snapshot(rt));
      }
      if (q.get('tab') === 'rf') document.getElementById('tab-RF')?.click();
      window.__vyuhHero = { ready: true, tMs: rt.sim.getState().clock.tMs };
    }, 400);
    return () => clearTimeout(t);
  }, [rt, commands, q]);

  if (error) return <StatusNotice tone="error" title={`Hero route: ${error}`} />;
  if (!rt || !commands) return <Skeleton label={`Preparing ${code}`} className="p-6" />;
  return <SimPlayer runtime={rt} commands={commands} />;
}

function HeroRoute() {
  const q = useSearchParams();
  return q.get('submit') === '1' ? <Submit code={q.get('s') ?? 'S01'} /> : <Hero />;
}

export default function HeroPage() {
  return (
    <Suspense fallback={null}>
      <HeroRoute />
    </Suspense>
  );
}
