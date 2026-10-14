'use client';

import { Billboard, Html, Line } from '@react-three/drei';
import type { Affiliation } from '@vyuh/shared';
import { toThree } from '@vyuh/sim-core';
import type { RefObject } from 'react';
import { Path, Shape, ShapeGeometry } from 'three';
import { AFFILIATION_STYLE, affiliationOutline } from '@/lib/affiliation';
import { useHudStore, type TrackView } from '@/lib/sim/store';
import { useSimRuntime } from './sim-context';

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
      <Line
        points={[
          [top.x, ground, top.z],
          [top.x, top.y, top.z],
        ]}
        color={style.hex}
        lineWidth={1}
        transparent
        opacity={0.6}
      />
      {selected && (
        <mesh position={[top.x, top.y + MARKER_M, top.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[MARKER_M * 1.8, MARKER_M * 2.2, 32]} />
          <meshBasicMaterial color="#ffffff" />
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
            className="pointer-events-none whitespace-nowrap font-mono text-xs font-bold"
            style={{ color: style.hex }}
          >
            [{style.letter}] {track.id}
          </div>
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
