'use client';

import { ContactClass, type Affiliation } from '@vyuh/shared';
import { useState, type ReactNode } from 'react';
import { ShellTopBar } from '@/components/app-header';
import {
  AffiliationSymbol,
  Banner,
  ClassSilhouette,
  CommsLog,
  CooldownRing,
  DemoBadge,
  EmptyState,
  ErrorState,
  FactStrip,
  Kbd,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Pips,
  QualificationChip,
  Readout,
  SheetFrame,
  Skeleton,
  SkeletonRows,
  StageStrip,
  StateChip,
  TelemetryStrip,
  Tooltip,
  type CommsLine,
} from '@/components/hud/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FieldError, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Menu } from '@/components/ui/menu';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Table, TableNotice, Td, Th, Tr, type SortDir } from '@/components/ui/table';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { CLASS_LABEL } from '@/lib/strings';

// Dev-only design gallery (DESIGN §12, decision 63): every primitive in its
// default, hover, focus, disabled, loading and error states. Hover and focus
// are forced with static classes so screenshots show them.

const SURFACES = ['bg-0', 'bg-1', 'bg-2', 'bg-3', 'line-1', 'line-2'] as const;
const TEXTS = ['text-1', 'text-body', 'text-2', 'text-3'] as const;
const SIGNALS = [
  'select',
  'cue',
  'primary-bg',
  'aff-hostile',
  'aff-friendly',
  'aff-neutral',
  'aff-unknown',
  'ok',
  'warn',
  'crit',
  'info',
] as const;
const SWATCH: Record<string, string> = {
  'bg-0': 'bg-bg-0',
  'bg-1': 'bg-bg-1',
  'bg-2': 'bg-bg-2',
  'bg-3': 'bg-bg-3',
  'line-1': 'bg-line-1',
  'line-2': 'bg-line-2',
  'text-1': 'bg-text-1',
  'text-body': 'bg-text-body',
  'text-2': 'bg-text-2',
  'text-3': 'bg-text-3',
  select: 'bg-select',
  cue: 'bg-cue',
  'primary-bg': 'bg-primary-bg',
  'aff-hostile': 'bg-aff-hostile',
  'aff-friendly': 'bg-aff-friendly',
  'aff-neutral': 'bg-aff-neutral',
  'aff-unknown': 'bg-aff-unknown',
  ok: 'bg-ok',
  warn: 'bg-warn',
  crit: 'bg-crit',
  info: 'bg-info',
};

const TYPE: [string, string, string][] = [
  ['text-display-xl', 'Display XL 44–96', 'Detect. Decide.'],
  ['text-display', 'Display 40/44', 'Counter-drone training'],
  ['text-h1', 'H1 24/30', 'Training'],
  ['text-h2', 'H2 18/24', 'Kill-chain breakdown'],
  ['text-panel-title', 'Panel title 12/16', 'Tracks'],
  ['text-label', 'Label 11/14', 'Range'],
  ['text-body', 'Body 14/21', 'Sort the tracks before you jam the sector.'],
  ['text-small', 'Small 12/17', 'Silent links never show on the RF detector.'],
  ['text-readout', 'Readout 14/18', '1.82 km · 045° · 00:48'],
  ['text-readout-lg', 'Readout large 20/24', '05:21'],
  ['text-meta', 'Meta 11/14 mono', 'PS 26247 · MOD · DSSC'],
];

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;
const HOVER: Record<(typeof VARIANTS)[number], string> = {
  primary: 'bg-select border-select',
  secondary: 'border-text-3 bg-bg-3',
  ghost: 'bg-bg-2 text-text-1',
  danger: 'bg-bg-3',
};
const FOCUS = 'outline-2 outline-offset-2 outline-select';
const PRESSED = 'translate-y-px';

const ROWS = [
  { code: 'S01', name: 'First Contact', d: 1, best: 92 },
  { code: 'S04', name: 'Night Drop', d: 3, best: 61 },
  { code: 'S06', name: 'Relay Site', d: 4, best: null },
];

const AFFS: Affiliation[] = ['HOSTILE', 'FRIENDLY', 'NEUTRAL', 'UNKNOWN'];

const LINES: CommsLine[] = [
  { id: '1', tMs: 8_000, text: 'NEW TRACK T001  BRG 318°  RNG 2.62 km' },
  { id: '2', tMs: 26_000, text: 'NEW TRACK T009  BRG 032°  RNG 1.16 km' },
  { id: '3', tMs: 41_250, text: 'T009 CLASSIFIED  SMALL QUAD' },
  { id: '4', tMs: 44_000, text: 'T009 AFFILIATION  HOSTILE' },
  { id: '5', tMs: 48_000, text: 'JAM ORDERED  T009  SECTOR 032° ±10°' },
  { id: '6', tMs: 49_000, text: 'T009 JAM  LINK LOST', status: 'ok' },
  { id: '7', tMs: 61_000, text: 'INTERCEPT  T004  MISSED', status: 'warn' },
  { id: '8', tMs: 62_000, text: 'MARK DETECTED  T004', pending: true },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="break-inside-avoid">
      <PanelHeader title={title} />
      <PanelBody className="space-y-3">{children}</PanelBody>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-3">
      <span className="text-label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function DesignGallery() {
  const [range, setRange] = useState(1.82);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-label">Dev only · not in production builds</p>
        <h1 className="text-h1">Design gallery</h1>
        <p className="text-body text-text-2">
          Every primitive from docs/DESIGN.md in its default, hover, pressed, focus, disabled,
          loading and error states.
        </p>
      </div>

      <section className="space-y-3" aria-label="Shell">
        <h2 className="text-panel-title">Shell (§11.0) · trainee, instructor</h2>
        <div className="border border-line-1">
          <ShellTopBar
            user={{ name: 'Trainee 1', role: 'TRAINEE' }}
            path="/aar/trends"
            onSignOut={() => undefined}
          />
        </div>
        <div className="border border-line-1">
          <ShellTopBar
            user={{ name: 'Instructor (demo)', role: 'INSTRUCTOR' }}
            path="/instructor/text"
            onSignOut={() => undefined}
          />
        </div>
      </section>

      <Panel>
        <PanelHeader title="Page header, fact strip, breadcrumbs (§5)" />
        <PanelBody className="space-y-6">
          <PageHeader
            reference="Training · scenarios and briefings"
            title="Training"
            context="Choose a scenario to open its briefing, or generate a new one."
            facts={[
              { label: 'Rating', value: '1,024' },
              { label: 'Assigned', value: 2 },
              { label: 'Best', value: 92, unit: '/ 100' },
            ]}
          />
          <PageHeader
            crumbs={[{ label: 'Unit', href: '/instructor' }, { label: 'Trainee trends' }]}
            title="Trainee 3"
            context="Alpha Battery"
            actions={<DemoBadge />}
          />
          <FactStrip
            facts={[
              { label: 'Sessions', value: 0 },
              { label: 'Latency', value: '—', muted: true },
              { label: 'Range', value: '1.82', unit: 'km' },
            ]}
            className="max-w-md"
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Sheet framing, telemetry strip, stage strip (§5)" />
        <PanelBody className="space-y-6">
          <SheetFrame sheet={2} of={6} reference="PS 26247 · MOD · DSSC" title="Kill chain">
            <StageStrip
              stages={{
                DETECT: { value: '92 %', note: 'Marked in 14 s' },
                TRACK: { value: '88 %' },
                IDENTIFY: { value: '41 %', state: 'weak', note: 'Birds called hostile' },
                DECIDE: { value: '75 %' },
                RESPOND: { value: '70 %' },
                ASSESS: { value: '—', state: 'none' },
              }}
            />
          </SheetFrame>
          <StageStrip current="IDENTIFY" />
          <TelemetryStrip
            aria-label="Scene"
            items={[
              { label: 'Preset', value: 'JK_MOUNTAIN' },
              { label: 'Sun', value: '−12.4°' },
              { label: 'ROE', value: 'Weapons tight' },
              { value: '34.0841 N 74.7973 E' },
            ]}
          />
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Interactive />

        <Section title="Chips: qualification, demo (§3.4)">
          <Row label="levels">
            <QualificationChip state="QUALIFIED" />
            <QualificationChip state="IN_PROGRESS" />
            <QualificationChip state="LOCKED" />
          </Row>
          <Row label="demo">
            <DemoBadge />
          </Row>
        </Section>

        <Section title="Class silhouettes">
          <div className="grid grid-cols-5 gap-px border border-line-1 bg-line-1">
            {ContactClass.options.map((c) => (
              <div key={c} className="flex flex-col items-center gap-1 bg-bg-1 p-2 text-text-1">
                <ClassSilhouette cls={c} size={40} />
                <span className="text-center text-small text-text-2">{CLASS_LABEL[c]}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Colour tokens (§3)">
          {[SURFACES, TEXTS, SIGNALS].map((group, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              {group.map((t) => (
                <div key={t} className="w-20">
                  <div className={`h-8 border border-line-2 ${SWATCH[t]}`} />
                  <span className="text-small text-text-2">--{t}</span>
                </div>
              ))}
            </div>
          ))}
        </Section>

        <Section title="Type scale (§4)">
          {TYPE.map(([cls, role, sample]) => (
            <div key={cls} className="grid grid-cols-[136px_1fr] items-baseline gap-3">
              <span className="text-label">{role}</span>
              <span className={cls}>{sample}</span>
            </div>
          ))}
        </Section>

        <Section title="Buttons">
          {VARIANTS.map((v) => (
            <Row key={v} label={v}>
              <Button variant={v} size="sm">
                Default
              </Button>
              <Button variant={v} size="sm" className={HOVER[v]}>
                Hover
              </Button>
              <Button variant={v} size="sm" className={`${HOVER[v]} ${PRESSED}`}>
                Pressed
              </Button>
              <Button variant={v} size="sm" className={FOCUS}>
                Focus
              </Button>
              <Button variant={v} size="sm" disabled>
                Disabled
              </Button>
              <Button variant={v} size="sm" loading>
                Starting…
              </Button>
            </Row>
          ))}
          <Row label="sizes">
            <Button size="hud">HUD 28</Button>
            <Button size="sm">Small 32</Button>
            <Button size="md" variant="primary">
              Primary 36
            </Button>
          </Row>
          <Row label="with key">
            <Button size="hud">
              Jam <Kbd>J</Kbd>
            </Button>
            <Button size="hud" variant="danger">
              Intercept <Kbd>I</Kbd>
            </Button>
          </Row>
        </Section>

        <Section title="Fields">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="g-default">Default</Label>
              <Input id="g-default" placeholder="Seed" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-hover">Hover</Label>
              <Input id="g-hover" defaultValue="40417" className="border-text-3" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-focus">Focus</Label>
              <Input id="g-focus" defaultValue="40417" className={FOCUS} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-disabled">Disabled</Label>
              <Input id="g-disabled" defaultValue="Locked by instructor" disabled />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-error">Error</Label>
              <Input id="g-error" defaultValue="-3" aria-invalid aria-describedby="g-error-msg" />
              <FieldError id="g-error-msg">Seed must be a whole number ≥ 0.</FieldError>
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-select">Select</Label>
              <Select id="g-select" defaultValue="JK_MOUNTAIN">
                <option value="PUNJAB_PLAINS">PUNJAB_PLAINS</option>
                <option value="JK_MOUNTAIN">JK_MOUNTAIN</option>
              </Select>
            </div>
          </div>
        </Section>

        <Section title="State chips and badges">
          <Row label="chips">
            <StateChip>Weapons tight</StateChip>
            <StateChip tone="muted">Practice</StateChip>
            <StateChip tone="active">TRK</StateChip>
            <StateChip tone="cue">CUE</StateChip>
            <StateChip tone="neutral" pulse>
              ACQ
            </StateChip>
          </Row>
          <Row label="status">
            <StateChip tone="ok">Synced 21</StateChip>
            <StateChip tone="warn">Queued 14</StateChip>
            <StateChip tone="crit">Offline</StateChip>
          </Row>
          <Row label="badges">
            <Badge>Default</Badge>
            <Badge tone="strong">Trainee</Badge>
            <Badge tone="ok">Neutralised</Badge>
            <Badge tone="warn">Unresolved</Badge>
            <Badge tone="crit">Leaked</Badge>
          </Row>
        </Section>

        <Section title="Affiliation symbols (§6)">
          <Row label="new">
            {AFFS.map((a) => (
              <AffiliationSymbol key={a} affiliation={a} size={20} />
            ))}
          </Row>
          <Row label="detected">
            {AFFS.map((a) => (
              <AffiliationSymbol key={a} affiliation={a} size={20} filled />
            ))}
          </Row>
          <Row label="grey (no colour)">
            <span className="flex gap-2 grayscale">
              {AFFS.map((a) => (
                <AffiliationSymbol key={a} affiliation={a} size={20} />
              ))}
            </span>
          </Row>
        </Section>

        <Section title="Readouts">
          <div className="flex flex-wrap gap-6">
            <Readout label="Range" value={range.toFixed(2)} unit="km" />
            <Readout label="Bearing" value="045°" />
            <Readout label="Clock" value="05:21" size="lg" flash={false} />
            <Readout label="Speed" value="—" muted />
          </div>
          <Button size="hud" onClick={() => setRange((r) => r - 0.07)}>
            Change range (flash)
          </Button>
        </Section>

        <Section title="Tooltip, key, cooldown, pips">
          <Row label="tooltip">
            <div className="pt-9">
              <Tooltip content="Jam the RF link in a ±10° sector" shortcut="J" forceOpen>
                <Button size="hud">Jam</Button>
              </Tooltip>
            </div>
          </Row>
          <Row label="disabled reason">
            <div className="pt-9">
              <Tooltip
                content="Cannot intercept — ROE: weapons tight needs a HOSTILE call"
                align="start"
                forceOpen
              >
                <Button size="hud" variant="danger" disabled>
                  Intercept
                </Button>
              </Tooltip>
            </div>
          </Row>
          <Row label="keys">
            <Kbd>D</Kbd>
            <Kbd>Tab</Kbd>
            <Kbd>Enter</Kbd>
            <Kbd>?</Kbd>
          </Row>
          <Row label="cooldown">
            <CooldownRing remaining={0} />
            <CooldownRing remaining={0.3} />
            <CooldownRing remaining={0.7} />
            <CooldownRing remaining={1} />
          </Row>
          <Row label="pips">
            {[1, 3, 5].map((v) => (
              <Pips key={v} value={v} />
            ))}
          </Row>
        </Section>

        <Section title="Banners">
          <Banner tone="crit">LEAK IMMINENT — T004 0.6 km from Post Alpha, closing</Banner>
          <Banner tone="warn">FRIENDLY IN JAM SECTOR — T007 marked friendly at 034°</Banner>
          <Banner tone="warn">Connection lost — events queued (14)</Banner>
        </Section>

        <Section title="Comms log">
          <div className="h-48 border border-line-1">
            <CommsLog lines={LINES} />
          </div>
          <div className="border border-line-1">
            <CommsLog lines={[]} />
          </div>
        </Section>

        <Section title="Loading, empty, error (§9)">
          <Skeleton label="Loading terrain · JK_MOUNTAIN" progress={0.42} />
          <Skeleton label="Loading scenarios" />
          <SkeletonRows label="Loading sessions" rows={3} />
          <EmptyState title="No sessions yet.">
            Run a scenario from Training; results and trends appear here.
          </EmptyState>
          <ErrorState
            error={new ApiError('NOT_FOUND', 'Session not found', 404)}
            subject="session"
          />
          <ErrorState
            error={new ApiError('NETWORK', 'Failed to fetch', 0)}
            subject="scenario list"
            onRetry={() => undefined}
          />
        </Section>
      </div>
    </div>
  );
}

function Interactive() {
  const [tab, setTab] = useState<'chain' | 'debrief' | 'ai'>('chain');
  const [page, setPage] = useState<'overview' | 'sessions'>('overview');
  const [mode, setMode] = useState<'PRACTICE' | 'ASSESSMENT'>('PRACTICE');
  const [band, setBand] = useState<'LOW' | 'MID' | 'HIGH'>('MID');
  const [sort, setSort] = useState<{ col: 'name' | 'best'; dir: SortDir }>({
    col: 'best',
    dir: 'desc',
  });
  const [selected, setSelected] = useState('S04');
  const [dialog, setDialog] = useState(false);
  const flip = (col: 'name' | 'best') =>
    setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  const rows = [...ROWS].sort((a, b) => {
    const k = sort.col === 'name' ? a.name.localeCompare(b.name) : (a.best ?? -1) - (b.best ?? -1);
    return sort.dir === 'asc' ? k : -k;
  });
  return (
    <>
      <Section title="Tabs">
        <Panel className="h-28">
          <Tabs
            idBase="g-strip"
            label="Review"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'chain', label: 'Kill chain' },
              { id: 'debrief', label: 'Debrief' },
              { id: 'ai', label: 'AI assist' },
            ]}
          />
          <TabPanel idBase="g-strip" id={tab} className="p-3 text-small text-text-2">
            Strip tabs fill a panel header. Arrow keys, Home and End move and select.
          </TabPanel>
        </Panel>
        <Tabs
          idBase="g-under"
          label="Trends"
          variant="underline"
          value={page}
          onChange={setPage}
          items={[
            { id: 'overview', label: 'Overview' },
            { id: 'sessions', label: 'Sessions' },
          ]}
        />
      </Section>

      <Section title="Segmented control">
        <Row label="sm">
          <SegmentedControl
            label="Session mode"
            value={mode}
            onChange={setMode}
            items={[
              {
                value: 'PRACTICE',
                label: 'Practice',
                hint: 'Pause allowed; hints in the Comms log',
              },
              { value: 'ASSESSMENT', label: 'Assessment', hint: 'Fixed clock, no pause, no hints' },
            ]}
          />
        </Row>
        <Row label="hud · disabled">
          <SegmentedControl
            label="Coverage altitude"
            size="hud"
            value={band}
            onChange={setBand}
            items={[
              { value: 'LOW', label: '15 m' },
              { value: 'MID', label: '60 m' },
              {
                value: 'HIGH',
                label: '120 m',
                disabled: true,
                hint: 'No sensor covers 120 m here',
              },
            ]}
          />
        </Row>
      </Section>

      <Section title="Table">
        <div className="border border-line-1">
          <Table aria-label="Scenarios">
            <thead>
              <tr>
                <Th>Code</Th>
                <Th
                  className="w-full"
                  onSort={() => flip('name')}
                  sorted={sort.col === 'name' ? sort.dir : undefined}
                >
                  Scenario
                </Th>
                <Th>Difficulty</Th>
                <Th
                  align="right"
                  onSort={() => flip('best')}
                  sorted={sort.col === 'best' ? sort.dir : undefined}
                >
                  Best
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr
                  key={r.code}
                  interactive
                  selected={selected === r.code}
                  tabIndex={0}
                  onClick={() => setSelected(r.code)}
                >
                  <Td className="text-readout text-text-2">{r.code}</Td>
                  <Td className="text-body">{r.name}</Td>
                  <Td>
                    <Pips value={r.d} />
                  </Td>
                  <Td align="right" className="text-readout">
                    {r.best ?? <span className="text-text-2">—</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div className="border border-line-1">
          <Table aria-label="Empty">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th className="w-full">Scenario</Th>
              </tr>
            </thead>
            <tbody>
              <TableNotice colSpan={2}>
                No Assessment sessions yet — run one from Training.
              </TableNotice>
            </tbody>
          </Table>
        </div>
      </Section>

      <Section title="Menu and dialog">
        <Row label="menu">
          <div className="h-40">
            <Menu
              defaultOpen
              label="Trainee 1"
              aria-label="Account menu example"
              align="start"
              buttonClassName="flex h-8 items-center rounded-sm border border-line-2 bg-bg-2 px-2 text-body"
              items={[
                { kind: 'action', label: 'Help & controls', onSelect: () => undefined },
                { kind: 'link', label: 'Scoring weights', href: '/instructor/scoring' },
                { kind: 'separator' },
                { kind: 'action', label: 'Sign out', onSelect: () => undefined },
              ]}
            />
          </div>
        </Row>
        <Row label="dialog">
          <Button size="sm" onClick={() => setDialog(true)} data-testid="g-open-dialog">
            Open dialog
          </Button>
          <Dialog
            open={dialog}
            onClose={() => setDialog(false)}
            title="Abandon session"
            testId="g-dialog"
            footer={
              <>
                <Button size="sm" variant="ghost" onClick={() => setDialog(false)}>
                  Keep training
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDialog(false)}>
                  Abandon
                </Button>
              </>
            }
          >
            The run ends now and is scored on what you did so far. This cannot be undone.
          </Dialog>
        </Row>
      </Section>
    </>
  );
}
