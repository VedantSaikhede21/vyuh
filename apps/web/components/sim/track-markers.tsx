'use client';

import { AiLabelLine } from '@/components/hud/ai-chip';
import { Billboard, Html } from '@react-three/drei';
import type { Affiliation } from '@vyuh/shared';
import { toThree } from '@vyuh/sim-core';
import { useEffect, useMemo, type RefObject } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  Path,
  Shape,
  ShapeGeometry,
} from 'three';
import { AFFILIATION_STYLE, affiliationOutline } from '@/lib/affiliation';
import { useHudStore, type TrackView } from '@/lib/sim/store';
import { useSimRuntime } from './sim-context';
import { SITES } from '@/lib/theme/scene-colours';
import { cn } from '@/lib/utils';

const MARKER_M = 22;

/** Inner edge of the hollow (not yet detected) frame, as a fraction of the outline. */
const HOLLOW_INNER = 0.62;

/**
 * APP-6 frame per affiliation as two shared geometries: hollow (a band, not yet
 * marked detected) and filled. One mesh per marker keeps draw calls at two per
 * track with the stalk (SPEC §16 budget).
 */
const FRAMES = new Map<Affiliation, { hollow: ShapeGeometry; filled: ShapeGeometry }>();
function frame(aff: Affiliation) {
  let f = FRAMES.get(aff);
  if (f === undefined) {
    const ring = (k: number) =>
      affiliationOutline(aff).map(([x, y]) => [x * MARKER_M * k, y * MARKER_M * k] as const);
    const outer = new Shape();
    ring(1).forEach(([x, y], i) => (i === 0 ? outer.moveTo(x, y) : outer.lineTo(x, y)));
    const band = new Shape();
    ring(1).forEach(([x, y], i) => (i === 0 ? band.moveTo(x, y) : band.lineTo(x, y)));
    const hole = new Path();
    ring(HOLLOW_INNER).forEach(([x, y], i) => (i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y)));
    band.holes.push(hole);
    f = { hollow: new ShapeGeometry(band), filled: new ShapeGeometry(outer) };
    FRAMES.set(aff, f);
  }
  return f;
}

/**
 * Stalk material per affiliation, shared and never disposed. A material per
 * marker (drei <Line>) freed its shader whenever bird tracks came and went, and
 * three.js recompiled it ~15 times a second in a 60-bird scene.
 */
const STALKS = new Map<Affiliation, LineBasicMaterial>();
function stalkMaterial(aff: Affiliation) {
  let m = STALKS.get(aff);
  if (m === undefined) {
    m = new LineBasicMaterial({
      color: AFFILIATION_STYLE[aff].hex,
      transparent: true,
      opacity: 0.6,
    });
    STALKS.set(aff, m);
  }
  return m;
}

/** Ground-to-marker stalk: one segment, positions updated in place. */
function Stalk({
  x,
  z,
  ground,
  top,
  aff,
}: {
  x: number;
  z: number;
  ground: number;
  top: number;
  aff: Affiliation;
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const pos = geometry.getAttribute('position') as BufferAttribute;
  pos.setXYZ(0, x, ground, z);
  pos.setXYZ(1, x, top, z);
  pos.needsUpdate = true;
  geometry.computeBoundingSphere();
  return <lineSegments geometry={geometry} material={stalkMaterial(aff)} />;
}

function TrackMarker({
  track,
  selected,
  onSelect,
  labelPortal,
}: {
  track: TrackView;
  selected: boolean;
  onSelect: (id: string) => void;
  labelPortal?: RefObject<HTMLElement | null> | undefined;
}) {
  const rt = useSimRuntime();
  const ground = rt.groundHeight(track.x, track.z);
  const top = toThree({ x: track.x, y: ground + track.altitudeAglM, z: track.z });
  const style = AFFILIATION_STYLE[track.affiliation];
  const shape = frame(track.affiliation);
  return (
    <group>
      <Billboard position={[top.x, top.y + MARKER_M, top.z]}>
        <mesh
          geometry={track.markedDetected ? shape.filled : shape.hollow}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(track.id);
          }}
        >
          <meshBasicMaterial
            color={style.hex}
            transparent
            opacity={track.markedDetected ? 0.7 : 0.9}
            depthWrite={false}
          />
        </mesh>
      </Billboard>
      <Stalk x={top.x} z={top.z} ground={ground} top={top.y} aff={track.affiliation} />
      {selected && (
        <mesh position={[top.x, top.y + MARKER_M, top.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[MARKER_M * 1.8, MARKER_M * 2.2, 32]} />
          <meshBasicMaterial color={SITES.markerStem} />
        </mesh>
      )}
      {/* DOM labels only where they matter: each <Html> costs layout (FPS with bird flocks). */}
      {(selected || track.markedDetected) && (
        <Html
          position={[top.x, top.y + MARKER_M * 3, top.z]}
          center
          zIndexRange={[10, 0]}
          {...(labelPortal ? { portal: labelPortal as RefObject<HTMLElement> } : {})}
        >
          <div
            className={cn(
              'pointer-events-none whitespace-nowrap border bg-bg-1 px-1 text-readout leading-4',
              style.textClass,
              selected ? 'border-select' : 'border-line-2',
            )}
          >
            {style.letter} {track.id}
          </div>
          {selected && track.ai && <AiLabelLine ai={track.ai} />}
        </Html>
      )}
    </group>
  );
}

/** Radar tracks (what the trainee knows), not ground truth. */
export function TrackMarkers({
  onSelect,
  labelPortal,
}: {
  onSelect: (id: string) => void;
  /** DOM element the track labels are placed in (the tactical view panel). */
  labelPortal?: RefObject<HTMLElement | null>;
}) {
  const hud = useHudStore((s) => s.hud);
  if (!hud) return null;
  return (
    <>
      {hud.tracks
        .filter((t) => t.status === 'ACTIVE')
        .map((t) => (
          <TrackMarker
            key={t.id}
            track={t}
            selected={t.id === hud.selectedTrackId}
            onSelect={onSelect}
            labelPortal={labelPortal}
          />
        ))}
    </>
  );
}
