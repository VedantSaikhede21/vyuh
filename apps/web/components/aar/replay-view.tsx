'use client';

import type { AarSessionResponse } from '@vyuh/shared';
import type { SimSnapshot, World } from '@vyuh/sim-core';
import { CircleHelp } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DemoBadge, Tooltip } from '@/components/hud/primitives';
import { SimPlayer } from '@/components/sim/player';
import { GuidedTour } from '@/components/tour/guided-tour';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { isGuest } from '@/lib/nav';
import { readOnlyCommands } from '@/lib/replay/commands';
import { ReplayController } from '@/lib/replay/controller';
import { timelineMarkers } from '@/lib/replay/gate';
import { useReplayStore } from '@/lib/replay/store';
import { eoSensor } from '@/lib/sim/commands';
import { snapshot, useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { AarSidePanel } from './side-panel';
import { ReplayHelp, ReplayTimeline, useReplayKeys } from './timeline';
import { TruthAnchors, TruthLabels, truthColumn, truthPpiOverlay } from './truth';

/**
 * AAR replay (DESIGN §11.7, Phase 4a Step 8): the player's own panels, read-only,
 * re-running the logged commands. A timeline strip sits above the bottom row and
 * the kill-chain panel takes the track card's place.
 */
export function ReplayView({
  data,
  world,
  keyframes,
  initialTMs,
}: {
  data: AarSessionResponse;
  world: World;
  keyframes: readonly SimSnapshot[];
  initialTMs: number;
}) {
  const controller = useMemo(
    () => new ReplayController(data.scenario, world, data.events, data.session.mode, keyframes),
    [data, world, keyframes],
  );
  const rt = controller.runtime;
  const commands = useMemo(() => readOnlyCommands(), []);
  const markers = useMemo(
    () => timelineMarkers(data.events, data.session.score, data.killChain),
    [data],
  );
  const dirty = useRef(true);
  const truth = useReplayStore((s) => s.truth);

  const seek = useCallback(
    (tMs: number) => {
      controller.seek(tMs);
      dirty.current = true;
      useReplayStore.getState().set({ tMs: controller.tMs });
    },
    [controller],
  );

  useEffect(() => {
    const eo = eoSensor(rt);
    useReplayStore
      .getState()
      .set({ tMs: 0, playing: false, speed: 1, focusCell: null, help: false });
    useUiStore.getState().reset({
      azDeg: 0,
      elDeg: 0,
      hfovDeg: eo?.kind === 'EO_IR' ? eo.fovDegMax : 30,
      lockTrackId: null,
      mode: 'DAY',
      trackMode: 'MANUAL',
    });
    seek(initialTMs);
  }, [rt, seek, initialTMs]);

  // Frame loop: play, publish the HUD snapshot, mirror the sim camera into the EO view.
  useEffect(() => {
    const eo = eoSensor(rt);
    const fovMax = eo?.kind === 'EO_IR' ? eo.fovDegMax : 30;
    const { publish } = useHudStore.getState();
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const ticks = controller.advance(now - last);
      last = now;
      if (ticks > 0 || dirty.current) {
        dirty.current = false;
        publish(snapshot(rt));
        const cam = rt.sim.getState().camera;
        const ui = useUiStore.getState();
        const hfovDeg = fovMax / cam.zoom;
        // Only when the camera moved: a new EO object re-renders every EO subscriber.
        if (
          ui.eo.azDeg !== cam.azDeg ||
          ui.eo.elDeg !== cam.elDeg ||
          ui.eo.hfovDeg !== hfovDeg ||
          ui.eo.mode !== cam.mode ||
          ui.eo.lockTrackId !== cam.lockTrackId
        ) {
          ui.setEo({
            azDeg: cam.azDeg,
            elDeg: cam.elDeg,
            hfovDeg,
            mode: cam.mode,
            lockTrackId: cam.lockTrackId,
          });
        }
        const st = useReplayStore.getState();
        if (st.tMs !== controller.tMs || st.playing !== controller.playing) {
          st.set({ tMs: controller.tMs, playing: controller.playing });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      publish(null);
    };
  }, [controller, rt]);

  useReplayKeys(controller, markers, seek);
  const { user } = useAuth();

  const ppiOverlay = useMemo(() => truthPpiOverlay(rt), [rt]);
  const trackColumn = useMemo(() => truthColumn(rt, truth), [rt, truth]);

  return (
    <>
      <SimPlayer
        runtime={rt}
        commands={commands}
        replay={{
          timeline: <ReplayTimeline controller={controller} markers={markers} seek={seek} />,
          side: <AarSidePanel data={data} onJump={seek} />,
          tacticalScene: <TruthAnchors />,
          tacticalOverlay: <TruthLabels runtime={rt} />,
          ppiOverlay,
          trackColumn,
          topBarExtra: (
            <>
              {data.session.isDemo && <DemoBadge />}
              <Tooltip content="Replay controls and markers" shortcut="?" align="end" side="bottom">
                <Button
                  size="hud"
                  variant="ghost"
                  aria-label="Replay controls"
                  onClick={() => useReplayStore.getState().set({ help: true })}
                >
                  <CircleHelp size={16} strokeWidth={1.5} />
                </Button>
              </Tooltip>
              <Button size="hud" asChild>
                <Link href={`/train/session/${data.session.id}`}>Back to debrief</Link>
              </Button>
            </>
          ),
        }}
      />
      <ReplayHelp />
      {/* Guided tour (Phase 6E): playback stops while it is open. */}
      <GuidedTour
        id="aar"
        auto={isGuest(user?.role)}
        onOpenChange={(open) => {
          if (open) controller.pause();
        }}
      />
    </>
  );
}
