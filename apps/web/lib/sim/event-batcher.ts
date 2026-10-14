import { MAX_EVENTS_PER_BATCH, type SimEvent } from '@vyuh/shared';

// Ships the sim event log to the API (SPEC §3.1): every 2 s and on end, one
// batch in flight at a time. A batch's content is fixed once formed, so a retry
// re-sends the same batchSeq and the server ignores duplicates.

export interface BatchSender {
  (batchSeq: number, events: readonly SimEvent[]): Promise<void>;
}

/** Errors the batcher should not retry (e.g. 4xx from the API). */
export class FatalBatchError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FatalBatchError';
  }
}

export interface BatcherOptions {
  send: BatchSender;
  /** Returns the full event log (append-only). */
  getEvents: () => readonly SimEvent[];
  /** Decide whether an error is worth retrying. Default: everything is. */
  isRetryable?: (err: unknown) => boolean;
  intervalMs?: number;
  backoffMs?: readonly number[];
  onStatus?: (status: BatcherStatus) => void;
}

export interface BatcherStatus {
  sentEvents: number;
  pendingEvents: number;
  retrying: boolean;
  error: string | null;
}

const DEFAULT_BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];

export class EventBatcher {
  private nextBatchSeq = 0;
  /** Events [0, formedUpTo) are in a formed batch (sent or in flight). */
  private formedUpTo = 0;
  private sentUpTo = 0;
  private inFlight: Promise<void> | null = null;
  private current: { seq: number; events: readonly SimEvent[] } | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fatal: FatalBatchError | null = null;
  private stopped = false;

  constructor(private readonly opts: BatcherOptions) {}

  start(): void {
    this.stopped = false;
    this.schedule(this.opts.intervalMs ?? 2000);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  get status(): BatcherStatus {
    return {
      sentEvents: this.sentUpTo,
      pendingEvents: this.opts.getEvents().length - this.sentUpTo,
      retrying: this.attempt > 0,
      error: this.fatal?.message ?? null,
    };
  }

  /** Send everything logged so far, retrying as needed. Rejects on a fatal error. */
  async finish(): Promise<void> {
    this.stop();
    for (;;) {
      if (this.fatal) throw this.fatal;
      if (this.sentUpTo >= this.opts.getEvents().length && this.current === null) return;
      await this.flushOnce();
      if (this.attempt > 0 && !this.fatal) await sleep(this.backoff());
    }
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flushOnce().then(() => {
        const interval = this.opts.intervalMs ?? 2000;
        this.schedule(this.attempt > 0 ? this.backoff() : interval);
      });
    }, delay);
  }

  private backoff(): number {
    const table = this.opts.backoffMs ?? DEFAULT_BACKOFF;
    return table[Math.min(this.attempt - 1, table.length - 1)] ?? 0;
  }

  /** Send the current batch (forming one if needed); never throws. */
  private flushOnce(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.fatal) return Promise.resolve();
    if (this.current === null) {
      const all = this.opts.getEvents();
      if (this.formedUpTo >= all.length) return Promise.resolve();
      const events = all.slice(this.formedUpTo, this.formedUpTo + MAX_EVENTS_PER_BATCH);
      this.current = { seq: this.nextBatchSeq++, events };
      this.formedUpTo += events.length;
    }
    const batch = this.current;
    this.inFlight = this.opts
      .send(batch.seq, batch.events)
      .then(() => {
        this.sentUpTo += batch.events.length;
        this.current = null;
        this.attempt = 0;
      })
      .catch((err: unknown) => {
        const retry = !(err instanceof FatalBatchError) && (this.opts.isRetryable?.(err) ?? true);
        if (retry) {
          this.attempt += 1;
        } else {
          this.fatal =
            err instanceof FatalBatchError
              ? err
              : new FatalBatchError(err instanceof Error ? err.message : 'Upload failed', err);
          this.stop();
        }
      })
      .finally(() => {
        this.inFlight = null;
        this.opts.onStatus?.(this.status);
      });
    return this.inFlight;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
