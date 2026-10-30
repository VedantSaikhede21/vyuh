'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';

/**
 * Page-level links under one top-bar item (Phase 6A): same 2 px --select
 * underline as the top bar. `suffix` is a query string carried across links.
 */
export function SubNav({
  label,
  links,
  suffix = '',
}: {
  label: string;
  links: readonly { href: string; label: string }[];
  suffix?: string;
}) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="flex h-8 gap-4 border-b border-line-1 print:hidden">
      {links.map((l) => {
        const on = path === l.href;
        return (
          <Link
            key={l.href}
            href={`${l.href}${suffix}`}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px flex items-center border-b-2 text-label font-medium transition-colors duration-150 ease-ui focus-visible:outline-offset-0',
              on ? 'border-select text-text-1' : 'border-transparent text-text-2 hover:text-text-1',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The two ways to build a scenario, under the Builder nav item. */
export function BuilderNav() {
  return (
    <SubNav
      label="Build a scenario"
      links={[
        { href: '/instructor/builder', label: 'Form' },
        { href: '/instructor/text', label: 'From text' },
      ]}
    />
  );
}

const UNIT_LINKS = [
  { href: '/instructor', label: 'Dashboard' },
  { href: '/instructor/readiness', label: 'Readiness' },
  { href: '/instructor/live', label: 'Live sessions' },
  { href: '/instructor/study', label: 'User study' },
] as const;

function UnitNavWithUnit() {
  const unit = useSearchParams().get('unit');
  return (
    <SubNav
      label="Unit views"
      links={UNIT_LINKS}
      suffix={unit ? `?unit=${encodeURIComponent(unit)}` : ''}
    />
  );
}

/** Unit views under the Unit nav item (Phase 6C); the chosen unit carries across. */
export function UnitNav() {
  return (
    <Suspense fallback={<SubNav label="Unit views" links={UNIT_LINKS} />}>
      <UnitNavWithUnit />
    </Suspense>
  );
}
