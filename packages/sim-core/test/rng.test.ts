import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng, mulberry32, type RandomStream } from '../src/index.ts';

const take = (s: RandomStream, n: number): number[] => Array.from({ length: n }, () => s.next());

describe('mulberry32', () => {
  it('matches the reference implementation (golden vectors)', () => {
    const g = mulberry32(40417);
    expect([g(), g(), g(), g(), g()]).toEqual([
      3849772335, 694883366, 895921161, 297022745, 150320234,
    ]);
    const z = mulberry32(0);
    expect([z(), z(), z()]).toEqual([1144304738, 1416247, 958946056]);
  });

  it('rejects non-uint32 seeds', () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => createRng(bad)).toThrow(RangeError);
    }
  });
});

describe('createRng', () => {
  it('(a) the same seed gives the same sequence', () => {
    const a = createRng(40417).stream('sensors');
    const b = createRng(40417).stream('sensors');
    expect(take(a, 1000)).toEqual(take(b, 1000));
  });

  it('different seeds and different stream names give different sequences', () => {
    expect(take(createRng(1).stream('x'), 10)).not.toEqual(take(createRng(2).stream('x'), 10));
    const rng = createRng(1);
    expect(take(rng.stream('birds'), 10)).not.toEqual(take(rng.stream('sensors'), 10));
  });

  it('(b) drawing from one stream does not change another', () => {
    const untouched = take(createRng(99).stream('effectors'), 50);

    const rng = createRng(99);
    take(rng.stream('sensors'), 10_000);
    rng.stream('birds').int(0, 100);
    rng.stream('new-feature').pick(['a', 'b']);
    expect(take(rng.stream('effectors'), 50)).toEqual(untouched);
  });

  it('stream creation order does not matter', () => {
    const r1 = createRng(7);
    const r2 = createRng(7);
    r2.stream('zzz');
    expect(take(r1.stream('a'), 20)).toEqual(take(r2.stream('a'), 20));
  });

  it('stream(name) returns the same continuing stream', () => {
    const rng = createRng(5);
    const first = rng.stream('s').next();
    const second = rng.stream('s').next();
    const fresh = createRng(5).stream('s');
    expect([first, second]).toEqual([fresh.next(), fresh.next()]);
  });

  it('helpers stay within their ranges', () => {
    const s = createRng(123).stream('helpers');
    for (let i = 0; i < 5000; i++) {
      const f = s.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = s.int(-3, 3);
      expect(Number.isInteger(n) && n >= -3 && n <= 3).toBe(true);
      const r = s.range(10, 20);
      expect(r >= 10 && r < 20).toBe(true);
    }
    expect(s.chance(0)).toBe(false);
    expect(s.chance(1)).toBe(true);
    expect(() => s.pick([])).toThrow(RangeError);
    expect(() => s.int(5, 1)).toThrow(RangeError);
  });
});

describe('purity (CLAUDE.md §2.5, §2.6)', () => {
  it('sim-core source uses no wall clock, Math.random, DOM, React or Three.js', () => {
    const srcDir = join(import.meta.dirname, '..', 'src');
    const forbidden = [
      /Math\.random/,
      /Date\.now/,
      /new Date\(/,
      /performance\.now/,
      /\bwindow\./,
      /\bdocument\./,
      /from ['"](react|three|@react-three\/[^'"]+)['"]/,
    ];
    const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(srcDir, file), 'utf8');
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });
});
