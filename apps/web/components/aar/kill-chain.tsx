'use client';

import type {
  ContactKillChain,
  KillChainStage,
  KillChainStatus,
  KillChainStep,
  Penalty,
} from '@vyuh/shared';
import { ChevronRight } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { AffiliationSymbol, Panel, PanelHeader, StateChip } from '@/components/hud/primitives';
import { humaniseFeedback } from '@/lib/hud/feedback';
import { clearedLabel, groupRows } from '@/lib/replay/kill-chain-rows';
import { useReplayStore } from '@/lib/replay/store';
import { CLASS_LABEL, formatClock } from '@/lib/strings';
import { cn } from '@/lib/utils';

// Kill-chain breakdown (Phase 4a Step 8, decision 110): one row per contact,
// threats first, six stages each with a status word (never colour alone).
// Choosing a stage jumps the replay to that moment. Non-threats handled
// correctly (every stage OK, no deduction) fold into one expandable row.

export const STAGE_SHORT: Record<KillChainStage, string> = {
  DETECT: 'DET',
  TRACK: 'TRK',
  IDENTIFY: 'IDN',
  DECIDE: 'DEC',
  RESPOND: 'RSP',
  ASSESS: 'ASM',
};

export const STAGE_NAME: Record<KillChainStage, string> = {
  DETECT: 'Detect',
  TRACK: 'Track',
  IDENTIFY: 'Identify',
  DECIDE: 'Decide',
  RESPOND: 'Respond',
  ASSESS: 'Assess',
};

const STATUS_TEXT: Record<KillChainStatus, string> = {
  OK: 'OK',
  LATE: 'LATE',
  WRONG: 'WRNG',
  MISSED: 'MISS',
  NOT_APPLICABLE: '—',
};

const STATUS_NAME: Record<KillChainStatus, string> = {
  OK: 'OK',
  LATE: 'Late',
  WRONG: 'Wrong',
  MISSED: 'Missed',
  NOT_APPLICABLE: 'Not applicable',
};

const STATUS_CLASS: Record<KillChainStatus, string> = {
  OK: 'text-ok',
  LATE: 'text-warn',
  WRONG: 'text-crit',
  MISSED: 'text-crit',
  NOT_APPLICABLE: 'text-text-2',
};

/** The row that folds the correctly handled non-threats away (spans the whole table). */
function ClearedToggle({
  count,
  open,
  colSpan,
  onToggle,
  tall,
}: {
  count: number;
  open: boolean;
  colSpan: number;
  onToggle: () => void;
  tall?: boolean;
}) {
  return (
    <tr className="border-t border-line-1">
      <td colSpan={colSpan} className="p-0">
        <button
          type="button"
          aria-expanded={open}
          data-testid="kc-cleared-toggle"
          onClick={onToggle}
          className={cn(
            'flex w-full items-center gap-1 pl-2 text-left text-small text-text-2 transition-colors duration-150 ease-ui hover:bg-bg-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-select',
            tall ? 'h-7' : 'h-6',
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-150 ease-ui',
              open && 'rotate-90',
            )}
          />
          {clearedLabel(count)}
          <span className="ml-1 font-mono text-ok">OK</span>
        </button>
      </td>
    </tr>
  );
}

/** Rows to draw: the listed ones, the fold row, and (when open) the cleared ones. */
function useGroupedRows(rows: readonly ContactKillChain[], penalties?: readonly Penalty[]) {
  const [open, setOpen] = useState(false);
  const { listed, cleared } = useMemo(() => groupRows(rows, penalties), [rows, penalties]);
  return {
    all: [...listed, ...cleared],
    listed,
    cleared,
    shown: open ? cleared : [],
    open,
    toggle: () => setOpen((o) => !o),
  };
}

function cellKey(row: ContactKillChain, step: KillChainStep): string {
  return `${row.contactId}:${step.stage}`;
}

function StepDetail({ row, step }: { row: ContactKillChain; step: KillChainStep }) {
  return (
    <div className="space-y-0.5 text-small" data-testid="kill-chain-detail">
      <p className="text-text-1">
        <span className="text-label">{STAGE_NAME[step.stage]}</span>{' '}
        <span className="font-mono">{row.contactId}</span>{' '}
        <span className={STATUS_CLASS[step.status]}>{STATUS_NAME[step.status]}</span>
        <span className="font-mono text-text-2"> · {formatClock(step.jumpTMs)}</span>
        {step.latencyS !== undefined && (
          <span className="font-mono text-text-2"> · {step.latencyS.toFixed(0)} s</span>
        )}
      </p>
      {(step.action || step.truth) && (
        <p className="truncate text-text-2">
          {step.action ? humaniseFeedback(step.action) : 'No action'}
          {step.truth && (
            <span className="text-text-2"> · truth: {humaniseFeedback(step.truth)}</span>
          )}
        </p>
      )}
      <p className="text-text-2">{humaniseFeedback(step.feedback)}</p>
    </div>
  );
}

/** Compact panel for the replay's action-bar slot (320 px). */
export const KillChainPanel = memo(function KillChainPanel({
  rows,
  penalties,
  onJump,
}: {
  rows: readonly ContactKillChain[];
  penalties?: readonly Penalty[];
  onJump: (tMs: number) => void;
}) {
  const focus = useReplayStore((s) => s.focusCell);
  const set = useReplayStore((s) => s.set);
  const g = useGroupedRows(rows, penalties);
  const sorted = g.all;
  const stages = sorted[0]?.stages ?? [];
  const focused = sorted
    .flatMap((r) => r.stages.map((s) => ({ row: r, step: s })))
    .find(({ row, step }) => cellKey(row, step) === focus);
  const threats = rows.filter((r) => r.isThreat).length;
  return (
    <Panel className="h-full border-0" data-testid="kill-chain">
      <PanelHeader title="Kill chain">
        <StateChip tone="muted">
          {threats} threat{threats === 1 ? '' : 's'}
        </StateChip>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse" aria-label="Kill chain by contact">
          <thead>
            <tr>
              <th className="sticky top-0 z-[1] h-6 bg-bg-2 pl-2 text-left text-label font-medium">
                Contact
              </th>
              {stages.map((s) => (
                <th
                  key={s.stage}
                  className="sticky top-0 z-[1] h-6 bg-bg-2 text-center text-label font-medium"
                  title={STAGE_NAME[s.stage]}
                >
                  {STAGE_SHORT[s.stage]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...g.listed, null, ...g.shown].map((row) =>
              row === null ? (
                g.cleared.length > 0 && (
                  <ClearedToggle
                    key="cleared"
                    count={g.cleared.length}
                    open={g.open}
                    colSpan={stages.length + 1}
                    onToggle={g.toggle}
                  />
                )
              ) : (
                <tr key={row.contactId} className="border-t border-line-1">
                  <td
                    className="h-6 max-w-[5.5rem] truncate pl-2 text-small"
                    title={`${row.contactId} · ${CLASS_LABEL[row.trueClass]}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <AffiliationSymbol affiliation={row.trueAffiliation} size={12} />
                      <span className="font-mono text-text-1">{row.contactId}</span>
                    </span>
                  </td>
                  {row.stages.map((step) => {
                    const key = cellKey(row, step);
                    return (
                      <td key={step.stage} className="p-0 text-center">
                        <button
                          type="button"
                          data-testid={`kc-${key.replace(':', '-')}`}
                          aria-label={`${row.contactId} ${STAGE_NAME[step.stage]}: ${STATUS_NAME[step.status]}. Jump to ${formatClock(step.jumpTMs)}`}
                          onMouseEnter={() => set({ focusCell: key })}
                          onFocus={() => set({ focusCell: key })}
                          onClick={() => {
                            set({ focusCell: key });
                            onJump(step.jumpTMs);
                          }}
                          className={cn(
                            'h-6 w-full font-mono text-[11px] leading-none transition-colors duration-150 ease-ui hover:bg-bg-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-select',
                            STATUS_CLASS[step.status],
                            focus === key && 'bg-bg-3',
                          )}
                        >
                          {STATUS_TEXT[step.status]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="h-[84px] shrink-0 overflow-y-auto border-t border-line-1 px-2 py-1.5">
        {focused ? (
          <StepDetail row={focused.row} step={focused.step} />
        ) : (
          <p className="text-small text-text-2">
            Point at a stage for what you did against what was there; select it to jump the replay
            there.
          </p>
        )}
      </div>
    </Panel>
  );
});

/** Wide table for the event-timeline fallback (no replay). */
export function KillChainTable({
  rows,
  penalties,
}: {
  rows: readonly ContactKillChain[];
  penalties?: readonly Penalty[];
}) {
  const g = useGroupedRows(rows, penalties);
  const sorted = g.all;
  const stages = sorted[0]?.stages.map((s) => s.stage) ?? [];
  return (
    <table
      className="w-full border-collapse"
      aria-label="Kill chain by contact"
      data-testid="kill-chain"
    >
      <thead>
        <tr>
          <th className="h-7 bg-bg-2 px-2 text-left text-label font-medium">Contact</th>
          {stages.map((s) => (
            <th key={s} className="h-7 bg-bg-2 px-2 text-left text-label font-medium">
              {STAGE_NAME[s]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...g.listed, null, ...g.shown].map((row) =>
          row === null ? (
            g.cleared.length > 0 && (
              <ClearedToggle
                key="cleared"
                count={g.cleared.length}
                open={g.open}
                colSpan={stages.length + 1}
                onToggle={g.toggle}
                tall
              />
            )
          ) : (
            <tr key={row.contactId} className="border-t border-line-1 align-top">
              <td className="px-2 py-1.5 text-small">
                <span className="inline-flex items-center gap-1.5">
                  <AffiliationSymbol affiliation={row.trueAffiliation} size={14} />
                  <span className="font-mono text-text-1">{row.contactId}</span>
                </span>
                <span className="block text-text-2">{CLASS_LABEL[row.trueClass]}</span>
              </td>
              {row.stages.map((step) => (
                <td
                  key={step.stage}
                  className="px-2 py-1.5 text-small"
                  title={humaniseFeedback(step.feedback)}
                >
                  <span className={cn('font-mono', STATUS_CLASS[step.status])}>
                    {STATUS_NAME[step.status]}
                  </span>
                  {step.actionTMs !== undefined && (
                    <span className="font-mono text-text-2"> {formatClock(step.actionTMs)}</span>
                  )}
                  {step.action && (
                    <span className="block text-text-2">{humaniseFeedback(step.action)}</span>
                  )}
                </td>
              ))}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
