import { KillChainStage } from '@vyuh/shared';
import type { ReactNode } from 'react';
import { STAGE_LABEL } from '@/lib/aar/answers';
import { cn } from '@/lib/utils';

export type StageState = 'ok' | 'weak' | 'none';

export interface StageCell {
  /** A value under the stage name: "82 %", "00:41". */
  value?: ReactNode;
  /** One line under the value. */
  note?: ReactNode;
  /** weak = the stage to work on (--warn rule + word); none = no data. */
  state?: StageState;
}

const STAGES = KillChainStage.options;

/**
 * The kill chain as a numbered 01–06 ruled strip (UI-PREP §1), reused on the
 * landing page, operator home, AAR and trends. A weak stage is marked by a
 * 2 px --warn top rule and the word WEAK, never colour alone.
 */
export function StageStrip({
  stages = {},
  current,
  className,
  'aria-label': ariaLabel = 'Kill chain',
}: {
  stages?: Partial<Record<KillChainStage, StageCell>>;
  /** Highlights one stage with the --select top rule (e.g. the one being explained). */
  current?: KillChainStage | undefined;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <ol
      aria-label={ariaLabel}
      className={cn(
        'grid grid-cols-3 gap-px border border-line-1 bg-line-1 md:grid-cols-6',
        className,
      )}
    >
      {STAGES.map((s, i) => {
        const cell = stages[s];
        const weak = cell?.state === 'weak';
        const none = cell?.state === 'none';
        return (
          <li
            key={s}
            aria-current={current === s ? 'step' : undefined}
            className={cn(
              'flex min-w-0 flex-col gap-1 border-t-2 bg-bg-1 px-3 pb-2 pt-1.5',
              current === s ? 'border-t-select' : weak ? 'border-t-warn' : 'border-t-transparent',
            )}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-meta">{String(i + 1).padStart(2, '0')}</span>
              {weak && <span className="text-label text-warn">Weak</span>}
            </span>
            <span className="text-panel-title text-text-1">{STAGE_LABEL[s]}</span>
            {cell?.value !== undefined && (
              <span className={cn('text-readout', none ? 'text-text-2' : 'text-text-1')}>
                {cell.value}
              </span>
            )}
            {cell?.note && <span className="text-small text-text-2">{cell.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}
