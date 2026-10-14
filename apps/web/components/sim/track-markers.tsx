'use client';

import { Html, Line } from '@react-three/drei';
import { toThree } from '@vyuh/sim-core';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import { useHudStore, type TrackView } from '@/lib/sim/store';
import { useSimRuntime } from './sim-context';

const MARKER_M = 22;

function TrackMarker({
  track,
  selected,
  onSelect,
}: {
  track: TrackView;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const rt = useSimRuntime();
  const ground = rt.groundHeight(track.x, track.z);
  const top = toThree({ x: track.x, y: ground + track.altitudeAglM, z: track.z });
  const style = AFFILIATION_STYLE[track.affiliation];
  return (
    <group>
      <mesh
        position={[top.x, top.y + MARKER_M, top.z]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(track.id);
        }}
      >
        <octahedronGeometry args={[MARKER_M, 0]} />
        <meshBasicMaterial color={style.hex} wireframe={!track.markedDetected} />
      </mesh>
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
      <Html position={[top.x, top.y + MARKER_M * 3, top.z]} center zIndexRange={[10, 0]}>
        <div
          className="pointer-events-none whitespace-nowrap font-mono text-xs font-bold"
          style={{ color: style.hex }}
        >
          [{style.letter}] {track.id}
        </div>
      </Html>
    </group>
  );
}

/** Radar tracks (what the trainee knows), not ground truth. */
export function TrackMarkers({ onSelect }: { onSelect: (id: string) => void }) {
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
          />
        ))}
    </>
  );
}
