import type { Scenario } from '@vyuh/shared';
import type { ReactNode } from 'react';
import { COVERAGE_ALTITUDES, type CoverageAltitude } from '@/lib/briefing/coverage';
import { cn } from '@/lib/utils';

// Briefing map legend (Checkpoint B item 3): the map's symbols drawn the way the
// canvas draws them (same tokens, dashes and shapes), shown under the map when
// the map is width-limited and leaves room (1920 × 1080).

/** Height the legend needs under the map, px. */
export const LEGEND_H = 150;

function Symbol({ children }: { children: ReactNode }) {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden className="shrink-0">
      {children}
    </svg>
  );
}

function Item({
  symbol,
  wide = false,
  children,
}: {
  symbol: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={cn('flex min-w-0 items-center gap-2', wide && 'col-span-2')}>
      <Symbol>{symbol}</Symbol>
      <span className="truncate text-small text-text-2">{children}</span>
    </li>
  );
}

export function BriefingLegend({
  scenario,
  altitude,
  intelAxis,
  scaleStepM,
  width,
}: {
  scenario: Scenario;
  altitude: CoverageAltitude;
  intelAxis: boolean;
  scaleStepM: number;
  width: number;
}) {
  const hasBorder = scenario.zones.some((z) => z.kind === 'BORDER_LINE');
  const hasZone = scenario.zones.some((z) => z.kind === 'NO_KINETIC');
  const hasInterceptor = scenario.effectors.some((e) => e.kind === 'INTERCEPT');
  return (
    <section
      style={{ width }}
      className="border border-line-1 bg-bg-1 px-3 py-2"
      aria-label="Map legend"
      data-testid="briefing-legend"
    >
      <h2 className="mb-1.5 text-label">Legend</h2>
      <ul className="grid grid-flow-row-dense grid-cols-3 gap-x-4 gap-y-1.5">
        <Item
          symbol={
            <rect
              x="8"
              y="1"
              width="12"
              height="12"
              className="fill-none stroke-select"
              strokeWidth="2"
            />
          }
        >
          Defended asset
        </Item>
        <Item symbol={<path d="M14 1 L19 12 L9 12 Z" className="fill-text-1" />}>Sensor site</Item>
        <Item
          symbol={
            <path
              d="M2 12 A 14 14 0 0 1 26 12"
              className="fill-none stroke-text-3"
              strokeDasharray="2 4"
            />
          }
        >
          Radar range
        </Item>
        {hasInterceptor && (
          <Item
            symbol={
              <path
                d="M2 12 A 14 14 0 0 1 26 12"
                className="fill-none stroke-text-3"
                strokeDasharray="6 4"
              />
            }
          >
            Interceptor range
          </Item>
        )}
        {hasZone && (
          <Item
            symbol={
              <>
                <defs>
                  <clipPath id="legend-zone">
                    <rect x="4" y="1" width="20" height="12" />
                  </clipPath>
                </defs>
                <g clipPath="url(#legend-zone)" className="stroke-text-3" strokeWidth="1">
                  {[-6, 1, 8, 15, 22, 29].map((d) => (
                    <line key={d} x1={d} y1="14" x2={d + 13} y2="1" />
                  ))}
                </g>
                <rect
                  x="4"
                  y="1"
                  width="20"
                  height="12"
                  className="fill-none stroke-text-2"
                  strokeWidth="1.5"
                />
              </>
            }
          >
            No-kinetic zone
          </Item>
        )}
        {hasBorder && (
          <Item
            symbol={
              <line
                x1="1"
                y1="7"
                x2="27"
                y2="7"
                className="stroke-text-3"
                strokeWidth="1.5"
                strokeDasharray="8 6"
              />
            }
          >
            Border
          </Item>
        )}
        {intelAxis && (
          <Item
            symbol={
              <>
                <line
                  x1="1"
                  y1="7"
                  x2="20"
                  y2="7"
                  className="stroke-text-2"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                />
                <path d="M27 7 L19 3 L19 11 Z" className="fill-text-2" />
              </>
            }
          >
            Intel axis
          </Item>
        )}
        <Item
          wide
          symbol={
            <>
              <rect x="2" y="1" width="24" height="12" className="fill-text-3" opacity="0.5" />
              <rect x="2" y="1" width="24" height="12" className="fill-bg-0" opacity="0.62" />
            </>
          }
        >
          <span className="whitespace-nowrap">
            Masked at{' '}
            {COVERAGE_ALTITUDES.map((a, i) => (
              <span key={a}>
                {i > 0 && <span className="text-text-3"> · </span>}
                <span
                  className={cn('text-readout', a === altitude ? 'text-text-1' : 'text-text-3')}
                >
                  {a}
                </span>
              </span>
            ))}
            <span className="text-text-3"> m AGL</span>
          </span>
        </Item>
        <Item
          symbol={
            <path
              d="M3 6 L3 10 L25 10 L25 6"
              className="fill-none stroke-text-1"
              strokeWidth="1.5"
            />
          }
        >
          Scale{' '}
          <span className="text-readout text-text-1">
            {scaleStepM >= 1000 ? scaleStepM / 1000 : scaleStepM}
          </span>
          <span className="text-text-3"> {scaleStepM >= 1000 ? 'km' : 'm'}</span>
        </Item>
      </ul>
    </section>
  );
}
