'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

export function AppHeader() {
  const { status, user, logout } = useAuth();
  const onLogin = usePathname() === '/login';
  return (
    <header className="relative z-10 border-b border-line-1 bg-bg-1">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-h2 tracking-[0.2em] text-text-1">
          VYUH
        </Link>
        <nav className="flex items-center gap-3">
          {status === 'authenticated' && user ? (
            <>
              <Link href="/train" className="text-label hover:text-text-1">
                Train
              </Link>
              <Link href="/aar/trends" className="text-label hover:text-text-1">
                Trends
              </Link>
              {(user.role === 'INSTRUCTOR' || user.role === 'ADMIN') && (
                <>
                  <Link href="/instructor" className="text-label hover:text-text-1">
                    Unit
                  </Link>
                  <Link href="/instructor/builder" className="text-label hover:text-text-1">
                    Builder
                  </Link>
                  <Link href="/instructor/scoring" className="text-label hover:text-text-1">
                    Scoring
                  </Link>
                </>
              )}
              <span className="text-label hidden sm:inline">
                {user.name} · {user.role}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                Log out
              </Button>
            </>
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
