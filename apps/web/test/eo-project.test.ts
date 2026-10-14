import { describe, expect, it } from 'vitest';
import { edgePoint, projectToEo } from '@/lib/hud/eo-project';

const mast = { x: 0, y: 10, z: 0 };

describe('projectToEo', () => {
  it('puts a target on the boresight at the centre', () => {
    const p = projectToEo(mast, { x: 0, y: 10, z: 1000 }, 0, 0, 30, 17);
    expect(p.onScreen).toBe(true);
    expect(p.ndcX).toBeCloseTo(0, 6);
    expect(p.ndcY).toBeCloseTo(0, 6);
  });

  it('maps a target at half the field of view to the picture edge', () => {
    const half = Math.tan((15 * Math.PI) / 180) * 1000;
    const p = projectToEo(mast, { x: half, y: 10, z: 1000 }, 0, 0, 30, 17);
    expect(p.ndcX).toBeCloseTo(1, 6);
    // Looking east (az 090), south is to the right.
    const east = projectToEo(mast, { x: 1000, y: 10, z: -half }, 90, 0, 30, 17);
    expect(east.ndcX).toBeCloseTo(1, 6);
  });

  it('puts a higher target above centre and flags a target behind the camera', () => {
    const above = projectToEo(mast, { x: 0, y: 60, z: 1000 }, 0, 0, 30, 17);
    expect(above.ndcY).toBeGreaterThan(0);
    const behind = projectToEo(mast, { x: 0, y: 10, z: -1000 }, 0, 0, 30, 17);
    expect(behind.onScreen).toBe(false);
  });
});

describe('edgePoint', () => {
  it('lands on the right and top borders', () => {
    expect(edgePoint(0, 400, 200, 10)).toEqual({ left: 390, top: 100 });
    const top = edgePoint(Math.PI / 2, 400, 200, 10);
    expect(top.left).toBeCloseTo(200, 6);
    expect(top.top).toBeCloseTo(10, 6);
  });
});
