import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** DESIGN §4 type roles (utilities in app/globals.css). */
export const TYPE_ROLES = [
  'display',
  'h1',
  'h2',
  'panel-title',
  'label',
  'body',
  'small',
  'readout',
  'readout-lg',
] as const;

// Without this, tailwind-merge reads `text-small` as a colour and drops a real
// colour class such as `text-primary-fg` in the same list.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...TYPE_ROLES] }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
