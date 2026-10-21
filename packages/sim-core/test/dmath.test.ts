import { describe, expect, it } from 'vitest';
import { datan, datan2, dcos, dexp, dlog, dlog10, dpow, dsin, dtan } from '../src/dmath.ts';

// Decision 111: the fdlibm ports agree with the engine's Math to within an ulp or
// two (the engine's own last bit is what differs between Node and Chrome).

/** Distance in units of the last place (ulp) of the expected value. */
function ulps(got: number, want: number): number {
  if (got === want) return 0;
  const ulp = Math.max(Number.EPSILON * Math.abs(want), Number.MIN_VALUE);
  return Math.abs(got - want) / ulp;
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

const CASES: [string, (x: number) => number, (x: number) => number, (r: () => number) => number][] =
  [
    ['sin', dsin, Math.sin, (r) => (r() - 0.5) * 200],
    ['cos', dcos, Math.cos, (r) => (r() - 0.5) * 200],
    ['tan', dtan, Math.tan, (r) => (r() - 0.5) * 1.4],
    ['atan', datan, Math.atan, (r) => (r() - 0.5) * 2 ** (r() * 40 - 20)],
    ['exp', dexp, Math.exp, (r) => (r() - 0.5) * 60],
    ['log', dlog, Math.log, (r) => 2 ** (r() * 80 - 40) * (1 + r())],
    ['log10', dlog10, Math.log10, (r) => 2 ** (r() * 80 - 40) * (1 + r())],
  ];

describe('dmath matches Math to fdlibm accuracy', () => {
  it.each(CASES)('%s', (_name, mine, ref, gen) => {
    const r = lcg(7);
    let worst = 0;
    for (let i = 0; i < 50_000; i++) {
      const x = gen(r);
      worst = Math.max(worst, ulps(mine(x), ref(x)));
    }
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('atan2 over all quadrants, and its special cases', () => {
    const r = lcg(11);
    let worst = 0;
    for (let i = 0; i < 50_000; i++) {
      const y = (r() - 0.5) * 2 ** (r() * 30 - 10);
      const x = (r() - 0.5) * 2 ** (r() * 30 - 10);
      worst = Math.max(worst, ulps(datan2(y, x), Math.atan2(y, x)));
    }
    expect(worst).toBeLessThanOrEqual(2);
    for (const [y, x] of [
      [0, 1],
      [-0, 1],
      [0, -1],
      [-0, -1],
      [1, 0],
      [-1, 0],
      [5, 1],
      [1e300, 1e-300],
      [1e-300, -1e300],
      [Infinity, 1],
      [1, -Infinity],
    ] as const) {
      expect(
        Object.is(datan2(y, x), Math.atan2(y, x)) || ulps(datan2(y, x), Math.atan2(y, x)) <= 1,
      ).toBe(true);
    }
    expect(Number.isNaN(datan2(NaN, 1))).toBe(true);
  });

  it('exact values and edges', () => {
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBe(1);
    expect(dexp(0)).toBe(1);
    expect(dlog(1)).toBe(0);
    expect(dlog(0)).toBe(-Infinity);
    expect(Number.isNaN(dlog(-1))).toBe(true);
    expect(dexp(1000)).toBe(Infinity);
    expect(dexp(-1000)).toBe(0);
    expect(dlog(Number.MIN_VALUE)).toBeCloseTo(Math.log(Number.MIN_VALUE), 10);
    expect(ulps(dpow(5, 1.276), Math.pow(5, 1.276))).toBeLessThanOrEqual(4);
    expect(dpow(0, 1.276)).toBe(0);
    expect(() => dsin(1e7)).toThrow(RangeError);
  });

  it('gives the same bits on every engine (golden values; a change breaks recorded replays)', () => {
    const xs = [0.1, 1, 2.5, -7.25, 100.3];
    expect(xs.map(dsin)).toEqual([
      0.09983341664682815, 0.8414709848078965, 0.5984721441039564, -0.8230808790115055,
      -0.22891692244520673,
    ]);
    expect(xs.map(dcos)).toEqual([
      0.9950041652780257, 0.5403023058681398, -0.8011436155469337, 0.5679241732886948,
      0.9734459628650248,
    ]);
    expect(xs.map(dexp)).toEqual([
      1.1051709180756477, 2.7182818284590455, 12.182493960703473, 0.0007101743888425491,
      3.628578599676532e43,
    ]);
    expect(xs.map((x) => dlog(Math.abs(x)))).toEqual([
      -2.3025850929940455, 0, 0.9162907318741551, 1.9810014688665833, 4.60816569496789,
    ]);
    expect(xs.map((x) => datan2(x, 3.7))).toEqual([
      0.02702044918726479, 0.2639637236257045, 0.5942137038004338, -1.0989071461562077,
      1.533923714423105,
    ]);
  });
});
