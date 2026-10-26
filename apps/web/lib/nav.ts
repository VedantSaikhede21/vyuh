import type { UserRole } from '@vyuh/shared';

// Signed-in navigation (DESIGN §11.0, UI-PREP §3). Pure data + functions so the
// role and active-state rules are unit-tested.

export interface NavItem {
  id: string;
  label: string;
  href: string;
  /** Path prefixes that make this item active (the href is always one). */
  match: readonly string[];
  /** Paths that must not activate it even though a prefix matches. */
  except?: readonly string[];
  /** Who sees it (no implicit hierarchy, like the API's require_role). */
  roles: readonly UserRole[];
  /**
   * The page exists. Items for pages still to be built (Phase 6C) stay in the
   * config but are never shown: no placeholders (DESIGN §2).
   */
  ready: boolean;
}

const EVERYONE: readonly UserRole[] = ['TRAINEE', 'INSTRUCTOR', 'ADMIN', 'GUEST'];
const STAFF: readonly UserRole[] = ['INSTRUCTOR', 'ADMIN'];

export const NAV: readonly NavItem[] = [
  // Trainee pages (own home and service record); staff reach records from Readiness.
  { id: 'home', label: 'Home', href: '/home', match: ['/home'], roles: ['TRAINEE'], ready: true },
  {
    id: 'training',
    label: 'Training',
    href: '/train',
    match: ['/train'],
    roles: EVERYONE,
    ready: true,
  },
  {
    id: 'library',
    label: 'Threat library',
    href: '/library',
    match: ['/library'],
    roles: EVERYONE,
    ready: true,
  },
  {
    id: 'aar',
    label: 'After-action',
    href: '/aar/trends',
    match: ['/aar'],
    roles: EVERYONE,
    ready: true,
  },
  {
    id: 'record',
    label: 'Service record',
    href: '/record',
    match: ['/record'],
    roles: ['TRAINEE'],
    ready: true,
  },
  {
    id: 'unit',
    label: 'Unit',
    href: '/instructor',
    match: ['/instructor'],
    except: ['/instructor/builder', '/instructor/text'],
    // Guests: the demo units, read-only (Phase 6E).
    roles: [...STAFF, 'GUEST'],
    ready: true,
  },
  {
    id: 'builder',
    label: 'Builder',
    href: '/instructor/builder',
    match: ['/instructor/builder', '/instructor/text'],
    roles: STAFF,
    ready: true,
  },
  {
    // Guests: the one preset text (Phase 6E); staff reach it under Builder.
    id: 'text',
    label: 'From text',
    href: '/instructor/text',
    match: ['/instructor/text'],
    roles: ['GUEST'],
    ready: true,
  },
];

export const isStaff = (role: UserRole | undefined): boolean =>
  role === 'INSTRUCTOR' || role === 'ADMIN';

export const isGuest = (role: UserRole | undefined): boolean => role === 'GUEST';

/** The items a role sees, in order. */
export function navFor(role: UserRole | undefined, items: readonly NavItem[] = NAV): NavItem[] {
  return items.filter((it) => it.ready && role !== undefined && it.roles.includes(role));
}

/**
 * Where a role lands after sign-in and on the wordmark: trainees Home, staff the
 * unit, guests Training (the demo path starts with S15).
 */
export const homeHref = (role: UserRole | undefined): string =>
  isStaff(role) ? '/instructor' : isGuest(role) ? '/train' : '/home';

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isActive(item: NavItem, path: string): boolean {
  if (item.except?.some((p) => under(path, p))) return false;
  return item.match.some((p) => under(path, p));
}

/** Public pages: their own header, never the signed-in shell (DESIGN §5, amendment 5). */
export const PUBLIC_PATHS: readonly string[] = ['/', '/login', '/sources', '/status', '/demo'];

export const ROLE_LABEL: Readonly<Record<UserRole, string>> = {
  TRAINEE: 'Trainee',
  INSTRUCTOR: 'Instructor',
  ADMIN: 'Admin',
  GUEST: 'Guest',
};
