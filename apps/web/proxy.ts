import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_COOKIE, SESSION_COOKIE, guardDecision } from '@/lib/route-guard';

/** Next 16's middleware: see lib/route-guard.ts for what this does and does not protect. */
export function proxy(request: NextRequest) {
  const decision = guardDecision(
    request.nextUrl.pathname,
    request.cookies.get(SESSION_COOKIE)?.value,
    request.cookies.get(ROLE_COOKIE)?.value,
  );
  if (decision.kind === 'allow') return NextResponse.next();
  return NextResponse.redirect(new URL(decision.to, request.url));
}

export const config = {
  matcher: ['/((?!_next|api|terrain|renders|landing|signatures|models|favicon).*)'],
};
