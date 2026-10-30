// Server-side route guard (system plan S1). A presence cookie, not a credential:
// it keeps signed-out visitors away from page shells and their bundles. Forging
// it shows a shell whose API calls still fail: the API is the security boundary.
// Pure, so the rules are unit-tested; proxy.ts applies them.

export const SESSION_COOKIE = 'vyuh_session';
export const ROLE_COOKIE = 'vyuh_role';
/** Long enough for a working day; the API token's own expiry still applies. */
export const SESSION_COOKIE_MAX_AGE_S = 7 * 24 * 3600;

const SIGNED_IN = ['/home', '/train', '/aar', '/instructor', '/record', '/library', '/notices'];
const SIGNED_IN_EXACT = ['/settings', '/help'];
/** Staff pages a guest may open on demo data (Phase 6E). */
const STAFF_ONLY = ['/instructor/builder', '/instructor/scoring'];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export type GuardDecision = { kind: 'allow' } | { kind: 'redirect'; to: string };

export function guardDecision(
  path: string,
  session: string | undefined,
  role: string | undefined,
): GuardDecision {
  const guarded = SIGNED_IN.some((p) => under(path, p)) || SIGNED_IN_EXACT.includes(path);
  if (!guarded) return { kind: 'allow' };
  if (!session) return { kind: 'redirect', to: `/login?next=${encodeURIComponent(path)}` };
  const staff = role === 'INSTRUCTOR' || role === 'ADMIN';
  if (!staff && role !== undefined && STAFF_ONLY.some((p) => under(path, p))) {
    return { kind: 'redirect', to: '/train' };
  }
  return { kind: 'allow' };
}

/** Mirror the signed-in state into cookies; null clears them. */
export function writeGuardCookies(role: string | null): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const age = role ? SESSION_COOKIE_MAX_AGE_S : 0;
  const attrs = `; Path=/; SameSite=Lax; Max-Age=${age}${secure}`;
  document.cookie = `${SESSION_COOKIE}=${role ? '1' : ''}${attrs}`;
  document.cookie = `${ROLE_COOKIE}=${role ?? ''}${attrs}`;
}
