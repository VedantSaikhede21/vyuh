'use client';

import type { UserRole } from '@vyuh/shared';
import { Bell, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { DemoPathStrip } from '@/components/demo-path';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Menu, type MenuItem } from '@/components/ui/menu';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { PUBLIC_PATHS, ROLE_LABEL, homeHref, isActive, isGuest, isStaff, navFor } from '@/lib/nav';
import { unreadLabel, useNoticeStore } from '@/lib/notices';
import { cn } from '@/lib/utils';

const WORDMARK = 'font-sans text-[19px] leading-6 font-semibold tracking-[0.18em] text-text-1';

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

/**
 * Shared shell top bar for signed-in pages (DESIGN §11.0, UI-PREP §3).
 * Presentational, so the design gallery can show it for each role.
 */
export function ShellTopBar({
  user,
  path,
  onSignOut,
  unread = null,
}: {
  user: { id: string; name: string; role: UserRole };
  path: string;
  onSignOut: () => void;
  /** Unread notices; null until known (nothing is shown). */
  unread?: number | null;
}) {
  const staff = isStaff(user.role);
  const items: MenuItem[] = [
    { kind: 'heading', label: `${user.name} · ${ROLE_LABEL[user.role]}`, testId: 'shell-role' },
    { kind: 'separator' },
    { kind: 'link', label: 'Settings', href: '/settings', testId: 'menu-settings' },
    { kind: 'link', label: 'Help & controls', href: '/help', testId: 'menu-help' },
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
    <header className="relative z-10 bg-bg-0 print:hidden" data-testid="shell-top-bar">
      <div className="mx-auto flex h-14 max-w-[1280px] items-stretch gap-8 px-6 min-[1600px]:max-w-[1440px] min-[1600px]:px-12">
        <Link
          href={homeHref(user.role)}
          className={cn(WORDMARK, 'self-center')}
          aria-label="VYUH — Home"
        >
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
                      'flex items-center border-b-2 pt-0.5 text-panel-title font-medium transition-colors duration-150 ease-ui focus-visible:outline-offset-0',
                      on
                        ? 'border-data text-text-1'
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
          {unread !== null && (
            <Link
              href="/notices"
              data-testid="shell-notices"
              aria-label={unread > 0 ? `Notices: ${unread} unread` : 'Notices: none unread'}
              aria-current={path === '/notices' ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-sm px-2 text-panel-title font-medium transition-colors duration-150 ease-ui hover:bg-bg-2',
                path === '/notices' ? 'text-text-1' : 'text-text-2 hover:text-text-1',
              )}
            >
              <Bell aria-hidden size={18} strokeWidth={1.5} />
              <span className="sr-only">Notices</span>
              {unread > 0 && (
                <span className="text-readout text-text-1" data-testid="shell-unread">
                  {unreadLabel(unread)}
                </span>
              )}
            </Link>
          )}
          <LocalTime />
          <Menu
            label={
              <>
                <Avatar name={user.name} id={user.id} />
                <span className="sr-only" data-testid="user-menu-name">
                  {user.name}
                </span>
                <ChevronDown aria-hidden size={16} strokeWidth={1.5} className="text-text-2" />
              </>
            }
            aria-label={`Account: ${user.name}`}
            buttonTestId="user-menu"
            buttonClassName="flex h-10 items-center gap-1 rounded-full px-1 text-body text-text-1 transition-colors duration-150 ease-ui hover:bg-bg-2 aria-expanded:bg-bg-2"
            items={items}
          />
        </div>
      </div>
    </header>
  );
}

const PUBLIC_LINK =
  'flex min-h-11 items-center text-panel-title font-medium text-text-2 transition-colors duration-150 ease-ui hover:text-text-1 md:min-h-0';

/**
 * Public pages (landing, login, sources, status, guest entry): wordmark, two
 * reference links and one action. Touch targets are 44 px on phones (amendment 5).
 */
function PublicHeader() {
  const { status, user } = useAuth();
  const path = usePathname();
  const action =
    status === 'authenticated' ? (
      <Link href={homeHref(user?.role)}>Open training</Link>
    ) : env.guestMode && path !== '/demo' ? (
      <Link href="/demo">Try the demo</Link>
    ) : path === '/login' ? null : (
      <Link href="/login">Sign in</Link>
    );
  return (
    <header className="relative z-10 bg-bg-0" data-testid="public-header">
      <div className="mx-auto flex min-h-14 max-w-[1280px] flex-wrap items-center gap-x-8 px-6 min-[1600px]:max-w-[1440px] min-[1600px]:px-12">
        <Link href="/" className={cn(WORDMARK, 'flex min-h-11 items-center md:min-h-0')}>
          VYUH
        </Link>
        <nav aria-label="Public" className="flex items-center gap-5">
          <Link
            href="/sources"
            aria-current={path === '/sources' ? 'page' : undefined}
            className={cn(PUBLIC_LINK, path === '/sources' && 'text-text-1')}
          >
            Sources
          </Link>
          <Link
            href="/status"
            aria-current={path === '/status' ? 'page' : undefined}
            className={cn(PUBLIC_LINK, path === '/status' && 'text-text-1')}
          >
            Status
          </Link>
        </nav>
        {action && (
          <Button asChild variant="secondary" size="sm" className="ml-auto min-h-11 md:min-h-0">
            {action}
          </Button>
        )}
      </div>
    </header>
  );
}

export function AppHeader() {
  const { status, user, logout } = useAuth();
  const path = usePathname() ?? '/';
  const signedIn = status === 'authenticated' && !!user;
  const unread = useNoticeStore((s) => s.unread);
  const refresh = useNoticeStore((s) => s.refresh);
  // Re-read the unread count on every signed-in navigation (cheap: one count query).
  useEffect(() => {
    if (signedIn && !PUBLIC_PATHS.includes(path)) refresh();
  }, [signedIn, path, refresh]);
  const header =
    PUBLIC_PATHS.includes(path) || !signedIn ? (
      <PublicHeader />
    ) : (
      <ShellTopBar user={user} path={path} unread={unread} onSignOut={() => void logout()} />
    );
  // Guests follow the demo path on every page, public ones included (Sources is a step).
  if (!signedIn || !isGuest(user.role)) return header;
  return (
    <>
      {header}
      <DemoPathStrip userId={user.id} path={path} />
    </>
  );
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
