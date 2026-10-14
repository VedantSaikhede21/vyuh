import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('keeps a colour class next to a DESIGN type role', () => {
    expect(cn('text-readout text-primary-fg', 'text-small')).toBe('text-primary-fg text-small');
  });

  it('lets a later type role replace an earlier one', () => {
    expect(cn('text-body', 'text-readout')).toBe('text-readout');
  });

  it('lets a later colour replace an earlier one', () => {
    expect(cn('text-text-2', 'text-text-1')).toBe('text-text-1');
  });
});
