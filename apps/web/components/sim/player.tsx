'use client';

import { ActionBar } from '@/components/hud/action-bar';
import { ContactList } from '@/components/hud/contact-list';
import { EoPanel } from '@/components/hud/eo-view';
import { RadarScope } from '@/components/hud/radar-scope';
import { CheatSheet, useShortcuts } from '@/components/hud/shortcuts';
import { TopBar } from '@/components/hud/top-bar';
import { AffiliationLegend } from '@/components/affiliation-legend';
import type { Commands } from '@/lib/sim/commands';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useRef } from 'react';
import { SimCanvas } from './sim-canvas';

/**
 * Sim player layout (SPEC §15), sized for 1366×768: tactical view centre,
 * radar PPI right, EO bottom-left, contact list bottom-centre, actions bottom-right.
 */
export function SimPlayer({
  runtime,
  commands,
  upload,
}: {
  runtime: SimRuntime;
  commands: Commands;
  upload: string;
}) {
  useShortcuts(commands);
  const container = useRef<HTMLDivElement>(null);
  const tactical = useRef<HTMLDivElement>(null);
  const eo = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={container}
      className="fixed inset-x-0 bottom-0 top-12 z-10 flex flex-col bg-background"
    >
      <TopBar
        name={runtime.scenario.name}
        mode={runtime.mode}
        upload={upload}
        commands={commands}
      />
      <div className="flex min-h-0 flex-1">
        <div ref={tactical} className="relative min-w-0 flex-1" />
        <aside className="flex w-[300px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-border bg-card p-2">
          <RadarScope runtime={runtime} commands={commands} />
          <AffiliationLegend />
        </aside>
      </div>
      <div className="flex h-[248px] shrink-0 border-t border-border bg-card">
        <div className="w-[400px] shrink-0 border-r border-border p-2">
          <EoPanel ref={eo} runtime={runtime} commands={commands} />
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <ContactList commands={commands} />
        </div>
        <div className="w-[290px] shrink-0 border-l border-border p-2">
          <ActionBar commands={commands} />
        </div>
      </div>
      <SimCanvas
        runtime={runtime}
        container={container}
        tactical={tactical}
        eo={eo}
        onSelectTrack={commands.select}
      />
      <CheatSheet />
    </div>
  );
}
