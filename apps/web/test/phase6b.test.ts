import { describe, expect, it } from 'vitest';
import { formatRating, primaryAction } from '@/lib/result-actions';
import { displayScore } from '@/lib/score-display';

describe('result-screen primary action (audit P0-3)', () => {
  it('retries under 50, pushes nothing from 50 to 79, next from 80', () => {
    expect(primaryAction(0)).toBe('retry');
    expect(primaryAction(49)).toBe('retry');
    expect(primaryAction(50)).toBeNull();
    expect(primaryAction(79)).toBeNull();
    expect(primaryAction(80)).toBe('next');
    expect(primaryAction(100)).toBe('next');
  });

  it('formats a rating with a thousands separator', () => {
    expect(formatRating(1024)).toBe('1,024');
    expect(formatRating(987)).toBe('987');
  });
});

describe('score display (decision 149)', () => {
  const components = {
    detection: 12.25,
    classification: 25,
    decision: 25.5,
    report: 0,
    efficiency: 0,
  };
  const base = {
    total: 62.5,
    components,
    componentMax: { detection: 25, classification: 25, decision: 30, report: 20, efficiency: 0 },
    penalties: [],
    perContact: [],
    metrics: {},
    treeVersion: 'default_v4',
  };

  it('shows the API display values, never a client rounding', () => {
    const display = { total: 63, components: { ...components, detection: 12.3, decision: 25.5 } };
    expect(displayScore({ ...base, display }).total).toBe(63);
    expect(displayScore({ ...base, display }).components.detection).toBe(12.3);
  });
});
