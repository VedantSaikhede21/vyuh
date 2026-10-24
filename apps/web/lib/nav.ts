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
  staffOnly?: boolean;
  /**
   * The page exists. Items for pages still to be built (Phase 6C) stay in the
   * config but are never shown: no placeholders (DESIGN §2).
   */
  ready: boolean;
}

export const NAV: readonly NavItem[] = [
  { id: 'home', label: 'Home', href: '/home', match: ['/home'], ready: false },
  { id: 'training', label: 'Training', href: '/train', match: ['/train'], ready: true },
  { id: 'library', label: 'Threat library', href: '/library', match: ['/library'], ready: false },
  { id: 'aar', label: 'After-action', href: '/aar/trends', match: ['/aar'], ready: true },
  { id: 'record', label: 'Service record', href: '/record', match: ['/record'], ready: false },
  {
    id: 'unit',
    label: 'Unit',
    href: '/instructor',
    match: ['/instructor'],
    except: ['/instructor/builder', '/instructor/text'],
    staffOnly: true,
    ready: true,
  },
  {
    id: 'builder',
    label: 'Builder',
    href: '/instructor/builder',
    match: ['/instructor/builder', '/instructor/text'],
    staffOnly: true,
    ready: true,
  },
];

export const isStaff = (role: UserRole | undefined): boolean =>
  role === 'INSTRUCTOR' || role === 'ADMIN';

/** The items a role sees, in order. */
export function navFor(role: UserRole | undefined, items: readonly NavItem[] = NAV): NavItem[] {
  return items.filter((it) => it.ready && (!it.staffOnly || isStaff(role)));
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isActive(item: NavItem, path: string): boolean {
  if (item.except?.some((p) => under(path, p))) return false;
  return item.match.some((p) => under(path, p));
}

/** Pages that carry their own public header instead of the signed-in shell (until Phase 6C). */
export const PUBLIC_PATHS: readonly string[] = ['/', '/login', '/sources'];

export const ROLE_LABEL: Readonly<Record<UserRole, string>> = {
  TRAINEE: 'Trainee',
  INSTRUCTOR: 'Instructor',
  ADMIN: 'Admin',
};
