'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/instructor/builder', label: 'Form' },
  { href: '/instructor/text', label: 'From text' },
] as const;

/**
 * The two ways to build a scenario, as page-level links under the Builder nav
 * item (Phase 6A): same 2 px --select underline as the top bar.
 */
export function BuilderNav() {
  const path = usePathname();
  return (
    <nav aria-label="Build a scenario" className="flex h-8 gap-4 border-b border-line-1">
      {LINKS.map((l) => {
        const on = path === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
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
