'use client';

import type { KillChainStage } from '@vyuh/shared';
import Image from 'next/image';
import { useRef, useState, type KeyboardEvent } from 'react';
import { rovingIndex } from '@/components/ui/tabs';
import { STAGE_LABEL } from '@/lib/aar/answers';
import { CHAIN, imageSize, imageSrc } from '@/lib/landing';
import { useFadeOnChange } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The kill chain as a numbered ruled strip of tabs (UI-PREP §1): choosing a stage
 * shows its real crop large, with what the trainee does there and what is
 * scored. One picture at a time in a fixed frame, so crops of different shapes
 * read at one scale (audit P2-8). Rendered on the server with Detect shown.
 */
export function ChainExplorer() {
  const [on, setOn] = useState<KillChainStage>('DETECT');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  useFadeOnChange(panel, on);
  const i = CHAIN.findIndex((c) => c.stage === on);
  const cur = CHAIN[i] ?? CHAIN[0]!;
  const size = imageSize(cur.shot.src);
  const onKey = (e: KeyboardEvent, at: number) => {
    const j = rovingIndex(e.key, at, CHAIN.length);
    if (j === null) return;
    e.preventDefault();
    setOn(CHAIN[j]!.stage);
    refs.current[j]?.focus();
  };
  return (
    <div className="space-y-4" data-testid="chain-explorer">
      <div
        role="tablist"
        aria-label="Kill chain stages"
        className="grid grid-cols-3 gap-px border border-line-1 bg-line-1 md:grid-cols-6"
      >
        {CHAIN.map((c, n) => {
          const sel = c.stage === on;
          return (
            <button
              key={c.stage}
              ref={(el) => {
                refs.current[n] = el;
              }}
              type="button"
              role="tab"
              id={`chain-tab-${c.stage}`}
              aria-selected={sel}
              aria-controls="chain-panel"
              tabIndex={sel ? 0 : -1}
              onClick={() => setOn(c.stage)}
              onKeyDown={(e) => onKey(e, n)}
              className={cn(
                'flex min-h-14 flex-col items-start gap-0.5 border-t-2 px-3 pb-2 pt-1.5 text-left transition-colors duration-150 ease-ui focus-visible:-outline-offset-2',
                sel
                  ? 'border-t-select bg-bg-2 text-text-1'
                  : 'border-t-transparent bg-bg-1 text-text-2 hover:bg-bg-2 hover:text-text-1',
              )}
            >
              <span className="text-meta">{String(n + 1).padStart(2, '0')}</span>
              <span className="text-panel-title">{STAGE_LABEL[c.stage]}</span>
            </button>
          );
        })}
      </div>
      <div
        ref={panel}
        role="tabpanel"
        id="chain-panel"
        aria-labelledby={`chain-tab-${cur.stage}`}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
      >
        <div className="flex aspect-[16/10] items-center justify-center border border-line-1 bg-bg-1 p-3">
          <Image
            key={cur.shot.src}
            src={imageSrc(cur.shot.src)}
            width={size.w}
            height={size.h}
            alt={cur.shot.alt}
            sizes="(min-width: 1024px) 720px, 100vw"
            unoptimized
            className="max-h-full w-auto max-w-full object-contain"
          />
        </div>
        <div className="space-y-4">
          <p className="text-h2 text-text-1 [text-wrap:balance]">{cur.line}</p>
          <dl className="space-y-1">
            <dt className="text-label">Scored on the server</dt>
            <dd className="max-w-prose-ui text-body text-text-body">{cur.scored}</dd>
          </dl>
          <p className="text-small text-text-2">{cur.from}</p>
        </div>
      </div>
    </div>
  );
}
