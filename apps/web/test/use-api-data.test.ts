import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedResource, invalidate, loadResource } from '@/lib/use-api-data';

describe('API data cache (S6)', () => {
  beforeEach(() => invalidate());

  it('stores what it loads and shares one request per key', async () => {
    const fetcher = vi.fn(async () => 1);
    const [a, b] = await Promise.all([loadResource('k', fetcher), loadResource('k', fetcher)]);
    expect([a, b]).toEqual([1, 1]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cachedResource('k')).toBe(1);
  });

  it('forgets by prefix and leaves other keys', async () => {
    await loadResource('home:u1', async () => 1);
    await loadResource('record:u1', async () => 2);
    invalidate('home');
    expect(cachedResource('home:u1')).toBeUndefined();
    expect(cachedResource('record:u1')).toBe(2);
  });

  it('a failed load caches nothing and rejects', async () => {
    await expect(
      loadResource('bad', async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
    expect(cachedResource('bad')).toBeUndefined();
  });

  it('an invalidated in-flight load does not repopulate the cache', async () => {
    let finish: (n: number) => void = () => {};
    const pending = loadResource('k', () => new Promise<number>((r) => (finish = r)));
    invalidate('k');
    finish(5);
    await pending;
    expect(cachedResource('k')).toBeUndefined();
  });
});
