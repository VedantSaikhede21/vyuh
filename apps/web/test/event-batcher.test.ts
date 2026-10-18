import type { SimEvent } from '@vyuh/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBatcher, FatalBatchError } from '../lib/sim/event-batcher';

const ev = (seq: number): SimEvent => ({
  seq,
  tMs: seq * 50,
  type: 'TRACK_SELECTED',
  trackId: 'T001',
  payload: {},
});

function setup(sendImpl?: (seq: number, events: readonly SimEvent[]) => Promise<void>) {
  const log: SimEvent[] = [];
  const calls: { seq: number; seqs: number[] }[] = [];
  const send = vi.fn(async (seq: number, events: readonly SimEvent[]) => {
    calls.push({ seq, seqs: events.map((e) => e.seq) });
    if (sendImpl) await sendImpl(seq, events);
  });
  const batcher = new EventBatcher({
    send,
    getEvents: () => log,
    isRetryable: (err) => !(err instanceof Error && err.message === 'bad request'),
    intervalMs: 2000,
    backoffMs: [100, 200],
  });
  return { log, calls, send, batcher };
}

describe('EventBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushes new events every interval with increasing batchSeq', async () => {
    const { log, calls, batcher } = setup();
    batcher.start();
    log.push(ev(0), ev(1));
    await vi.advanceTimersByTimeAsync(2000);
    log.push(ev(2));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000); // nothing new: no empty batch
    expect(calls).toEqual([
      { seq: 0, seqs: [0, 1] },
      { seq: 1, seqs: [2] },
    ]);
    batcher.stop();
  });

  it('sends an empty heartbeat batch after 60 s with nothing new, then carries on', async () => {
    const { log, calls, batcher } = setup();
    batcher.start();
    log.push(ev(0));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(58_000); // paused: nothing new, no heartbeat yet
    expect(calls).toEqual([{ seq: 0, seqs: [0] }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toEqual([
      { seq: 0, seqs: [0] },
      { seq: 1, seqs: [] },
    ]);
    await vi.advanceTimersByTimeAsync(30_000); // the heartbeat reset the idle clock
    log.push(ev(1));
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls.at(-1)).toEqual({ seq: 2, seqs: [1] });
    batcher.stop();
  });

  it('sends no heartbeat from finish()', async () => {
    const { log, calls, batcher } = setup();
    batcher.start();
    log.push(ev(0));
    await vi.advanceTimersByTimeAsync(120_000);
    const before = calls.length;
    await batcher.finish();
    expect(calls.length).toBe(before);
    expect(calls.every((c) => c.seqs.length > 0 || c.seq > 0)).toBe(true);
  });

  it('splits large logs into batches of at most 500', async () => {
    const { log, calls, batcher } = setup();
    for (let i = 0; i < 1201; i++) log.push(ev(i));
    await batcher.finish();
    expect(calls.map((c) => c.seqs.length)).toEqual([500, 500, 201]);
    expect(calls.map((c) => c.seq)).toEqual([0, 1, 2]);
  });

  it('retries a failed batch with the same batchSeq and content', async () => {
    let failures = 2;
    const { log, calls, batcher } = setup(async () => {
      if (failures-- > 0) throw new Error('network');
    });
    log.push(ev(0), ev(1));
    batcher.start();
    await vi.advanceTimersByTimeAsync(2000); // fail 1
    log.push(ev(2)); // arrives while retrying: must not join the retried batch
    await vi.advanceTimersByTimeAsync(100); // fail 2
    await vi.advanceTimersByTimeAsync(200); // success
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toEqual([
      { seq: 0, seqs: [0, 1] },
      { seq: 0, seqs: [0, 1] },
      { seq: 0, seqs: [0, 1] },
      { seq: 1, seqs: [2] },
    ]);
    expect(batcher.status).toMatchObject({ sentEvents: 3, pendingEvents: 0, retrying: false });
    batcher.stop();
  });

  it('stops on a non-retryable error and finish() rejects', async () => {
    const { log, send, batcher } = setup(async () => {
      throw new Error('bad request');
    });
    log.push(ev(0));
    await expect(batcher.finish()).rejects.toBeInstanceOf(FatalBatchError);
    expect(send).toHaveBeenCalledTimes(1);
    expect(batcher.status.error).toBe('bad request');
  });

  it('finish() drains everything, waiting out retries', async () => {
    let failures = 1;
    const { log, calls, batcher } = setup(async () => {
      if (failures-- > 0) throw new Error('network');
    });
    log.push(ev(0), ev(1), ev(2));
    const done = batcher.finish();
    await vi.runAllTimersAsync();
    await done;
    expect(calls.at(-1)).toEqual({ seq: 0, seqs: [0, 1, 2] });
    expect(batcher.status.pendingEvents).toBe(0);
  });
});
