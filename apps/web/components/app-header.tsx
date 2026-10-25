'use client';

import type { UserRole } from '@vyuh/shared';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { Kbd, StateChip } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Menu, type MenuItem } from '@/components/ui/menu';
import { useAuth } from '@/lib/auth';
import { PUBLIC_PATHS, ROLE_LABEL, isActive, isStaff, navFor } from '@/lib/nav';
import { SHORTCUTS } from '@/lib/strings';
import { cn } from '@/lib/utils';

const WORDMARK = 'text-h2 tracking-[0.2em] text-text-1';

// Local wall-clock time, HH:MM, as an external store: the server renders
// nothing, the client re-reads every 30 s.
const subscribeClock = (onChange: () => void) => {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
};
const readClock = () =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function LocalTime() {
  const hhmm = useSyncExternalStore(subscribeClock, readClock, () => null);
  if (!hhmm) return null;
  return (
    <time title="Local time" className="text-readout text-text-2" data-testid="local-time">
      {hhmm}
      <span className="ml-1 text-label">LT</span>
    </time>
  );
}

/** Help & controls until the full Help page exists (Phase 6C): the shortcut reference. */
function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Help & controls" testId="help-dialog">
      <p className="mb-3 text-small text-text-2">
        Shortcuts in the sim player. Press <Kbd>?</Kbd> there for the same list.
      </p>
      <table className="w-full border-collapse" aria-label="Keyboard shortcuts">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} className="border-t border-line-1 first:border-t-0">
              <td className="h-8 whitespace-nowrap pr-4">
                <Kbd>{s.keys}</Kbd>
              </td>
              <td className="h-8 text-body text-text-body">{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

/**
 * Shared shell top bar for signed-in pages (DESIGN §11.0, UI-PREP §3).
 * Presentational, so the design gallery can show it for each role.
 */
export function ShellTopBar({
  user,
  path,
  onSignOut,
}: {
  user: { name: string; role: UserRole };
  path: string;
  onSignOut: () => void;
}) {
  const [help, setHelp] = useState(false);
  const staff = isStaff(user.role);
  const items: MenuItem[] = [
    {
      kind: 'action',
      label: 'Help & controls',
      onSelect: () => setHelp(true),
      testId: 'menu-help',
    },
    ...(staff
      ? [
          {
            kind: 'link' as const,
            label: 'Scoring weights',
            href: '/instructor/scoring',
            testId: 'menu-scoring',
          },
        ]
      : []),
    { kind: 'separator' },
    { kind: 'action', label: 'Sign out', onSelect: onSignOut, testId: 'menu-sign-out' },
  ];
  return (
    <header className="relative z-10 border-b border-line-1 bg-bg-1" data-testid="shell-top-bar">
      <div className="mx-auto flex h-12 max-w-[1280px] items-stretch gap-6 px-4">
        <Link href="/train" className={cn(WORDMARK, 'self-center')} aria-label="VYUH — Training">
          VYUH
        </Link>
        <nav aria-label="Main" className="flex min-w-0 items-stretch">
          <ul className="flex items-stretch gap-5">
            {navFor(user.role).map((it) => {
              const on = isActive(it, path);
              return (
                <li key={it.id} className="flex">
                  <Link
                    href={it.href}
                    aria-current={on ? 'page' : undefined}
                    data-testid={`nav-${it.id}`}
                    className={cn(
                      'flex items-center border-b-2 pt-0.5 text-panel-title transition-colors duration-150 ease-ui focus-visible:outline-offset-0',
                      on
                        ? 'border-select text-text-1'
                        : 'border-transparent text-text-2 hover:text-text-1',
                    )}
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <StateChip tone="neutral" data-testid="shell-role">
            {ROLE_LABEL[user.role]}
          </StateChip>
          <LocalTime />
          <Menu
            label={
              <>
                <span className="max-w-40 truncate" data-testid="user-menu-name">
                  {user.name}
                </span>
                <ChevronDown aria-hidden size={16} strokeWidth={1.5} />
              </>
            }
            aria-label={`Account: ${user.name}`}
            buttonTestId="user-menu"
            buttonClassName="flex h-8 items-center gap-1 rounded-sm border border-transparent px-2 text-body text-text-1 transition-colors duration-150 ease-ui hover:border-line-2 hover:bg-bg-2 aria-expanded:border-line-2 aria-expanded:bg-bg-2"
            items={items}
          />
        </div>
      </div>
      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </header>
  );
}

/** Public pages keep their own simple header until the Phase 6C rework. */
function PublicHeader() {
  const { status } = useAuth();
  const onLogin = usePathname() === '/login';
  return (
    <header className="relative z-10 border-b border-line-1 bg-bg-1">
      <div className="mx-auto flex h-12 max-w-[1280px] items-center justify-between px-4">
        <Link href="/" className={WORDMARK}>
          VYUH
        </Link>
        <nav className="flex items-center gap-3">
          {status === 'authenticated' ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/train">Open training</Link>
            </Button>
          ) : onLogin ? null : (
            <Button asChild variant="secondary" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function AppHeader() {
  const { status, user, logout } = useAuth();
  const path = usePathname() ?? '/';
  if (PUBLIC_PATHS.includes(path) || status !== 'authenticated' || !user) return <PublicHeader />;
  return <ShellTopBar user={user} path={path} onSignOut={() => void logout()} />;
}

/** First focusable element on every page (DESIGN §11.0). */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-sm bg-primary-bg px-3 py-2 text-panel-title text-primary-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-2"
    >
      Skip to content
    </a>
  );
}
