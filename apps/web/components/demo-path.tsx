'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DEMO_STEPS,
  nextStep,
  recordDemoStep,
  stepFromPath,
  stepHref,
  useDemoPath,
} from '@/lib/demo-path';
import { cn } from '@/lib/utils';

/**
 * The guest's demo path (SPEC §20, Phase 6E): a thin ruled strip under the top bar
 * with the six steps, done ones checked, and one link to the next. Seeing a step's
 * page completes it. The sim player covers it (fixed, above the shell).
 */
export function DemoPathStrip({ userId, path }: { userId: string; path: string }) {
  const state = useDemoPath(userId);
  useEffect(() => {
    const hit = stepFromPath(path);
    if (hit) recordDemoStep(userId, hit.step, hit.session);
  }, [userId, path]);

  const next = nextStep(state);
  const at = next ? DEMO_STEPS.findIndex((s) => s.id === next) : DEMO_STEPS.length;
  return (
    <div
      className="relative z-10 border-b border-line-1 bg-bg-1 print:hidden"
      data-testid="demo-path"
    >
      <div className="mx-auto flex h-9 max-w-[1280px] items-center gap-4 px-4">
        <span className="text-label text-text-2">Demo</span>
        <ol aria-label="Demo path" className="hidden min-w-0 flex-1 items-center gap-4 xl:flex">
          {DEMO_STEPS.map((s, i) => {
            const done = state.done.includes(s.id);
            const current = s.id === next;
            return (
              <li
                key={s.id}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex h-9 items-center gap-1.5 border-b-2 text-small whitespace-nowrap',
                  current ? 'border-select text-text-1' : 'border-transparent text-text-2',
                )}
              >
                <span className="text-meta">{String(i + 1).padStart(2, '0')}</span>
                {s.label}
                {done && (
                  <>
                    <Check aria-hidden className="size-3.5 text-ok" strokeWidth={1.5} />
                    <span className="sr-only">(done)</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <span className="min-w-0 flex-1 truncate text-small text-text-2 xl:hidden">
          {next
            ? `Step ${at + 1} of ${DEMO_STEPS.length} · ${DEMO_STEPS[at]!.label}`
            : 'Demo path complete'}
        </span>
        {next ? (
          <Button asChild variant="secondary" size="sm" data-testid="demo-next">
            <Link href={stepHref(next, state)}>Next · {DEMO_STEPS[at]!.label}</Link>
          </Button>
        ) : (
          <span className="text-small text-text-2" data-testid="demo-done">
            All six steps seen. The guest account is deleted automatically.
          </span>
        )}
      </div>
    </div>
  );
}
