'use client';

import { Scenario } from '@vyuh/shared';
import type { World } from '@vyuh/sim-core';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { Shot } from '@/lib/scene/shots';
import { loadWorld } from '@/lib/terrain/load-world';
import S01 from '../../../../api/app/seed/scenarios/S01.json';
import S02 from '../../../../api/app/seed/scenarios/S02.json';
import S03 from '../../../../api/app/seed/scenarios/S03.json';
import S04 from '../../../../api/app/seed/scenarios/S04.json';
import S05 from '../../../../api/app/seed/scenarios/S05.json';
import S06 from '../../../../api/app/seed/scenarios/S06.json';
import S07 from '../../../../api/app/seed/scenarios/S07.json';
import S08 from '../../../../api/app/seed/scenarios/S08.json';
import S09 from '../../../../api/app/seed/scenarios/S09.json';
import S10 from '../../../../api/app/seed/scenarios/S10.json';
import S11 from '../../../../api/app/seed/scenarios/S11.json';
import S12 from '../../../../api/app/seed/scenarios/S12.json';
import S13 from '../../../../api/app/seed/scenarios/S13.json';
import S14 from '../../../../api/app/seed/scenarios/S14.json';
import S15 from '../../../../api/app/seed/scenarios/S15.json';

// Dev-only render route (decision 63): one scenario's place, no HUD, for
// scripts/render-stills.ts. ?s=S05&shot=establishing|low

const ALL: Record<string, unknown> = {
  S01,
  S02,
  S03,
  S04,
  S05,
  S06,
  S07,
  S08,
  S09,
  S10,
  S11,
  S12,
  S13,
  S14,
  S15,
};

const MissionScene = dynamic(
  () => import('@/components/scene/mission-scene').then((m) => m.MissionScene),
  { ssr: false },
);

function Render() {
  const q = useSearchParams();
  const code = q.get('s') ?? 'S01';
  const shot = (q.get('shot') ?? 'establishing') as Shot;
  const [data, setData] = useState<{ scenario: Scenario; world: World } | null>(null);
  useEffect(() => {
    const scenario = Scenario.parse(ALL[code]);
    void loadWorld(scenario.terrain.preset).then((world) => setData({ scenario, world }));
  }, [code]);
  return (
    <div className="fixed inset-0 z-50 bg-bg-0" data-testid={data ? 'render-ready' : 'render-wait'}>
      {data && <MissionScene scenario={data.scenario} world={data.world} shot={shot} />}
    </div>
  );
}

export default function RenderPage() {
  return (
    <Suspense>
      <Render />
    </Suspense>
  );
}
