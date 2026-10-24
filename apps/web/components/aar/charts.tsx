'use client';

import type { StageRate } from '@vyuh/shared';
import type { ReactNode } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Panel, PanelHeader } from '@/components/hud/primitives';
import { STAGE_LABEL } from '@/lib/aar/answers';
import { UI } from '@/lib/theme/scene-colours';
import { cn } from '@/lib/utils';

// Trends and unit charts (DESIGN §11.7): a panel titled with a question, a one-line
// answer under it, then the chart. Recharts draws SVG with explicit colours, so the
// token mirrors in scene-colours are used (monochrome chrome, one series colour).

export function QuestionPanel({
  question,
  answer,
  children,
  className,
  testId,
  aside,
}: {
  question: string;
  answer: string;
  children: ReactNode;
  className?: string;
  testId?: string;
  aside?: ReactNode;
}) {
  return (
    <Panel className={className} data-testid={testId}>
      <PanelHeader title={question}>{aside}</PanelHeader>
      <p className="px-3 pt-2 text-small text-text-1" data-testid="answer">
        {answer}
      </p>
      <div className="min-h-0 flex-1 p-3 pt-2">{children}</div>
    </Panel>
  );
}

export interface SeriesPoint {
  /** Session number, 1-based. */
  n: number;
  value: number | null;
  /** Tooltip line: scenario code, date. */
  label: string;
}

const AXIS = { stroke: UI.line2, tickLine: false } as const;
const TICK = { fill: UI.text3, fontSize: 11, fontFamily: 'var(--font-mono)' } as const;

function ChartTooltip({
  active,
  payload,
  unit,
  digits,
}: {
  active?: boolean | undefined;
  payload?: readonly { payload?: unknown }[] | undefined;
  unit: string;
  digits: number;
}) {
  const p = payload?.[0];
  if (!active || !p) return null;
  const point = p.payload as SeriesPoint;
  return (
    <div className="rounded-md border border-line-2 bg-bg-2 px-2 py-1 shadow-overlay">
      <p className="text-label">
        Session {point.n} · {point.label}
      </p>
      <p className="text-readout">
        {point.value === null ? '—' : point.value.toFixed(digits)}
        {unit && <span className="text-text-3"> {unit}</span>}
      </p>
    </div>
  );
}

/** One series over sessions. `step` draws a step line (difficulty). */
export function SeriesChart({
  data,
  domain,
  unit = '',
  digits = 0,
  height = 150,
  step = false,
  ticks,
  ariaLabel,
  yWidth = 30,
}: {
  data: SeriesPoint[];
  domain: [number | 'auto', number | 'auto'];
  /** Y-axis width in px (wider for four-digit values such as a rating). */
  yWidth?: number;
  unit?: string;
  digits?: number;
  height?: number;
  step?: boolean;
  ticks?: number[];
  ariaLabel: string;
}) {
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={UI.line1} vertical={false} />
          <XAxis dataKey="n" {...AXIS} tick={TICK} interval="preserveStartEnd" />
          <YAxis
            {...AXIS}
            tick={TICK}
            domain={domain}
            ticks={ticks}
            allowDecimals={false}
            width={yWidth}
          />
          <Tooltip
            cursor={{ stroke: UI.line2 }}
            isAnimationActive={false}
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload}
                unit={unit}
                digits={digits}
              />
            )}
          />
          <Line
            type={step ? 'stepAfter' : 'linear'}
            dataKey="value"
            stroke={UI.text1}
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: UI.text1, stroke: 'none' }}
            activeDot={{ r: 4, fill: UI.select, stroke: 'none' }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Kill-chain stages as horizontal bars of their OK rate; the weakest is marked. */
export function StageBars({
  stages,
  weakest,
}: {
  stages: readonly StageRate[];
  weakest: string | null;
}) {
  return (
    <ul className="space-y-1.5" data-testid="stage-bars">
      {stages.map((s) => {
        const pct = s.rate === null ? null : Math.round(s.rate * 100);
        const isWeak = s.stage === weakest;
        return (
          <li key={s.stage} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-2">
            <span className={cn('text-label', isWeak && 'text-warn')}>{STAGE_LABEL[s.stage]}</span>
            <span className="h-2 bg-bg-3" aria-hidden>
              {pct !== null && (
                <span
                  className={cn('block h-full', isWeak ? 'bg-warn' : 'bg-text-2')}
                  style={{ width: `${pct}%` }}
                />
              )}
            </span>
            <span className="text-right text-readout">
              {pct === null ? (
                <span className="text-text-3">n/a</span>
              ) : (
                <>
                  {pct}
                  <span className="text-text-3"> %</span>
                  <span className="text-small text-text-3">
                    {' · '}
                    {s.ok}/{s.total}
                  </span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A percentage as a labelled bar (unit component averages). */
export function PctBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2">
      <span className="text-label">{label}</span>
      <span className="h-2 bg-bg-3" aria-hidden>
        {value !== null && (
          <span className="block h-full bg-text-2" style={{ width: `${value}%` }} />
        )}
      </span>
      <span className="text-right text-readout">
        {value === null ? (
          <span className="text-text-3">n/a</span>
        ) : (
          <>
            {Math.round(value)}
            <span className="text-text-3"> %</span>
          </>
        )}
      </span>
    </div>
  );
}
