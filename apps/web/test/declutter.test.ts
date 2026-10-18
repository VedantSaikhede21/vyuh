import { describe, expect, it } from 'vitest';
import { placeLabels } from '@/lib/hud/declutter';

const bounds = { w: 320, h: 320 };
const label = (id: string, x: number, y: number, keep = false) => ({
  id,
  x,
  y,
  w: 40,
  h: 12,
  keep,
});

describe('placeLabels', () => {
  it('places a lone label to the right of its symbol', () => {
    expect(placeLabels([label('T001', 100, 100)], bounds, 5).get('T001')).toEqual({
      x: 108,
      y: 94,
    });
  });

  it('moves around a fixed obstacle (a zone label)', () => {
    const zone = { x: 105, y: 90, w: 60, h: 12 };
    expect(placeLabels([label('T001', 100, 100)], bounds, 5, 3, [zone]).get('T001')).toEqual({
      x: 52,
      y: 94,
    });
  });

  it('moves to the left when the right side would leave the scope', () => {
    expect(placeLabels([label('T001', 300, 100)], bounds, 5).get('T001')).toEqual({
      x: 252,
      y: 94,
    });
  });

  it('drops labels in a tight cluster but always keeps the selected one', () => {
    const flock = Array.from({ length: 7 }, (_, i) => label(`T00${i + 1}`, 100 + i * 4, 100));
    flock[6] = label('T007', 124, 100, true);
    const placed = placeLabels(flock, bounds, 5);
    expect(placed.has('T007')).toBe(true);
    expect(placed.size).toBeLessThan(7);
  });

  it('never overlaps two placed labels', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      label(`T${String(i).padStart(3, '0')}`, 40 + (i % 6) * 45, 40 + Math.floor(i / 6) * 50),
    );
    const placed = [...placeLabels(many, bounds, 5).values()];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const overlap = a.x < b.x + 40 && b.x < a.x + 40 && a.y < b.y + 12 && b.y < a.y + 12;
        expect(overlap).toBe(false);
      }
    }
  });
});
