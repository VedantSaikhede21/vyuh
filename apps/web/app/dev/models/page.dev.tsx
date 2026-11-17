'use client';

import { Canvas } from '@react-three/fiber';
import type { ContactClass } from '@vyuh/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { Box3, CompressedTexture, type Mesh, type MeshStandardMaterial, Vector3 } from 'three';
import { ClassModelMesh, type ModelPose } from '@/components/sim/contact-model-mesh';
import { useAssetGltf } from '@/lib/assets/gltf';
import { GROUND } from '@/lib/theme/scene-colours';

// Dev-only model check (decision 175): every contact model at 1 m, nose to −z
// (the red arrow), from ?view=side|top|front|three-quarter. ?big=1 shows one
// model per row; ?frames=1 the bird's 12 baked wingbeat frames. Used for
// screenshots when tuning MODEL_SPECS. ?pipeline=1 (realism plan R0): the shipped
// quad-small next to its meshopt + KTX2 build from scripts/assets/optimize.mjs,
// both through lib/assets, with what each decoded to.

interface Decoded {
  extensions: string[];
  textures: string[];
}

declare global {
  interface Window {
    __vyuhPipeline?: Record<string, Decoded>;
  }
}

function PipelineModel({ url, label }: { url: string; label: string }) {
  const gltf = useAssetGltf(url);
  const scene = useMemo(() => {
    const s = gltf.scene.clone();
    const box = new Box3().setFromObject(s);
    const size = box.getSize(new Vector3()).length();
    s.scale.setScalar(1.4 / size);
    s.position.copy(box.getCenter(new Vector3()).multiplyScalar(-1.4 / size));
    return s;
  }, [gltf]);
  useEffect(() => {
    const textures = new Set<string>();
    gltf.scene.traverse((o) => {
      const map = ((o as Mesh).material as MeshStandardMaterial | undefined)?.map;
      if (map)
        textures.add(
          `${map.constructor.name}${map instanceof CompressedTexture ? ' (GPU-compressed)' : ''}`,
        );
    });
    const json = gltf.parser.json as { extensionsUsed?: string[] };
    window.__vyuhPipeline = {
      ...window.__vyuhPipeline,
      [label]: { extensions: json.extensionsUsed ?? [], textures: [...textures] },
    };
  }, [gltf, label]);
  return <primitive object={scene} />;
}

function PipelineTile({ url, label }: { url: string; label: string }) {
  return (
    <div className="relative aspect-square" style={{ background: GROUND.modelBackdrop }}>
      <span className="absolute left-2 top-1 z-10 font-mono text-xs text-black">{label}</span>
      <Canvas camera={{ position: VIEWS['three-quarter'], fov: 40, near: 0.01 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, 4, 1]} intensity={2.2} />
        <Suspense fallback={null}>
          <PipelineModel url={url} label={label} />
        </Suspense>
      </Canvas>
    </div>
  );
}

const CLASSES: readonly ContactClass[] = [
  'QUAD_SMALL',
  'QUAD_HEAVY',
  'FPV',
  'FIXED_WING_SMALL',
  'LOITERING_GENERIC',
  'HELICOPTER_FRIENDLY',
  'BIRD_LARGE',
];

const VIEWS: Record<string, [number, number, number]> = {
  side: [1.6, 0, 0],
  top: [0, 1.6, 0.001],
  front: [0, 0, -1.6],
  'three-quarter': [1.1, 0.7, -1.1],
};

function One({ cls, view, hold }: { cls: ContactClass; view: string; hold?: number }) {
  const pose = useCallback((_: number, out: ModelPose) => {
    out.visible = true;
    out.position.set(0, 0, 0);
    out.headingDeg = 0;
    out.sizeM = 1;
  }, []);
  return (
    <div
      className="relative aspect-square"
      style={{ background: GROUND.modelBackdrop }}
      data-testid={`model-${cls}`}
    >
      <span className="absolute left-2 top-1 z-10 font-mono text-xs text-black">
        {cls}
        {hold !== undefined && ` · ${hold.toFixed(2)}`}
      </span>
      <Canvas camera={{ position: VIEWS[view] ?? VIEWS.side, fov: 40, near: 0.01 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, 4, 1]} intensity={2.2} />
        <axesHelper args={[0.6]} />
        <arrowHelper args={[undefined, undefined, 0.7, 0xff0000]} rotation={[-Math.PI / 2, 0, 0]} />
        <Suspense fallback={null}>
          <ClassModelMesh cls={cls} count={1} pose={pose} holdPhase={hold} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function Models() {
  const q = useSearchParams();
  const view = q.get('view') ?? 'three-quarter';
  const big = q.get('big') === '1';
  if (q.get('pipeline') === '1') {
    return (
      <div className="grid grid-cols-2 gap-2 bg-black p-2">
        <PipelineTile url="/models/quad-small.glb" label="shipped (WebP)" />
        <PipelineTile
          url="/models/pipeline-test/quad-small.glb"
          label="pipeline (meshopt + KTX2)"
        />
      </div>
    );
  }
  if (q.get('frames') === '1') {
    // The bird's baked wingbeat, one frame per tile.
    return (
      <div className="grid grid-cols-6 gap-2 bg-black p-2">
        {Array.from({ length: 12 }, (_, f) => (
          <One key={f} cls="BIRD_LARGE" view={view} hold={f / 12} />
        ))}
      </div>
    );
  }
  return (
    <div className={`grid gap-2 bg-black p-2 ${big ? 'grid-cols-1' : 'grid-cols-4'}`}>
      {CLASSES.map((c) => (
        <One key={c} cls={c} view={view} />
      ))}
    </div>
  );
}

export default function ModelsPage() {
  return (
    <Suspense>
      <Models />
    </Suspense>
  );
}
