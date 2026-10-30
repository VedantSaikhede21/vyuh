'use client';

import type { ReactNode } from 'react';
import { PageHeader, Panel, PanelHeader } from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { GraphicsSetting } from '@/lib/gpu-tier';
import { useSettings, writeSettings, type MotionSetting } from '@/lib/settings';

// Settings (Phase 6C). Kept in this browser; no account-wide settings, and no
// unit setting (SI everywhere, CLAUDE.md §6). There is no sound, so no sound setting.

function Row({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-x-6 gap-y-2 border-t border-line-1 px-3 py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-0.5">
        <p className="text-body text-text-1">{title}</p>
        <p className="max-w-prose-ui text-small text-text-2">{help}</p>
      </div>
      {children}
    </div>
  );
}

function Settings() {
  const s = useSettings();
  return (
    <div className="space-y-6">
      <PageHeader
        reference="Settings"
        title="Settings"
        context="Saved in this browser only. Another computer or browser starts from the defaults."
      />
      <Panel className="max-w-3xl">
        <PanelHeader title="Display and controls" />
        <div data-testid="settings">
          <Row
            title="Reduced motion"
            help="Stops transitions and flashes, and the 3D view jumps to a selected track instead of easing. Follow system uses your operating system's setting."
          >
            <SegmentedControl<MotionSetting>
              label="Reduced motion"
              items={[
                { value: 'SYSTEM', label: 'Follow system', testId: 'motion-system' },
                { value: 'REDUCE', label: 'Reduce', testId: 'motion-reduce' },
              ]}
              value={s.motion}
              onChange={(motion) => writeSettings({ motion })}
            />
          </Row>
          <Row
            title="Graphics quality"
            help="Terrain detail, shadows and trees in the 3D views. Sensors and scoring are the same at every level. Auto reads your graphics card; pick a lower level if the view stutters."
          >
            <SegmentedControl<GraphicsSetting>
              label="Graphics quality"
              items={[
                { value: 'AUTO', label: 'Auto', testId: 'graphics-auto' },
                { value: 'HIGH', label: 'High', testId: 'graphics-high' },
                { value: 'MEDIUM', label: 'Medium', testId: 'graphics-medium' },
                { value: 'LOW', label: 'Low', testId: 'graphics-low' },
              ]}
              value={s.graphics}
              onChange={(graphics) => writeSettings({ graphics })}
            />
          </Row>
          <Row
            title="Shortcut list at the start of Practice"
            help="Opens the shortcut list (?) when a Practice run begins. The clock is held until you close it. Assessment runs never open it."
          >
            <SegmentedControl<'OFF' | 'ON'>
              label="Shortcut list at the start of Practice"
              items={[
                { value: 'OFF', label: 'Off', testId: 'sheet-off' },
                { value: 'ON', label: 'On', testId: 'sheet-on' },
              ]}
              value={s.shortcutsOnStart ? 'ON' : 'OFF'}
              onChange={(v) => writeSettings({ shortcutsOnStart: v === 'ON' })}
            />
          </Row>
        </div>
      </Panel>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}
