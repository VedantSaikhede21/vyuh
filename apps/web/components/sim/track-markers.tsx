'use client';

import { Billboard, Html, Line } from '@react-three/drei';
import type { Affiliation } from '@vyuh/shared';
import { toThree } from '@vyuh/sim-core';
import type { RefObject } from 'react';
import { Shape, ShapeGeometry } from 'three';
import { AFFILIATION_STYLE, affiliationOutline } from '@/lib/affiliation';
import { useHudStore, type TrackView } from '@/lib/sim/store';
import { useSimRuntime } from './sim-context';

const MARKER_M = 22;

/** APP-6 frame per affiliation: filled geometry and closed outline, shared by all markers. */
const FRAMES = new Map<Affiliation, { fill: ShapeGeometry; outline: [number, number, number][] }>();
function frame(aff: Affiliation) {
  let f = FRAMES.get(aff);
  if (f === undefined) {
    const pts = affiliationOutline(aff).map(([x, y]) => [x * MARKER_M, y * MARKER_M] as const);
    const shape = new Shape();
    pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    const outline = [...pts, pts[0]!].map(([x, y]) => [x, y, 0] as [number, number, number]);
    f = { fill: new ShapeGeometry(shape), outline };
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
          geometry={shape.fill}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(track.id);
          }}
        >
          <meshBasicMaterial
            color={style.hex}
            transparent
            opacity={track.markedDetected ? 0.55 : 0.08}
            depthWrite={false}
          />
        </mesh>
        <Line points={shape.outline} color={style.hex} lineWidth={2} />
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
