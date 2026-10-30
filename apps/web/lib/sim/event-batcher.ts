import { MAX_EVENTS_PER_BATCH, type SimEvent } from '@vyuh/shared';

// Ships the sim event log to the API (SPEC §3.1): every 2 s and on end, one
// batch in flight at a time. A batch's content is fixed once formed, so a retry
// re-sends the same batchSeq and the server ignores duplicates. With nothing new
// to send for `heartbeatMs` (e.g. a paused practice run), an empty batch tells
// the server the page is still open, so the session is not abandoned (SPEC §4.5).

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
  /** Send an empty batch after this long with nothing to send. Default 60 s. */
  heartbeatMs?: number;
  backoffMs?: readonly number[];
  onStatus?: (status: BatcherStatus) => void;
  /** Called when a batch is formed, before it is sent (session resume). */
  onFormed?: (position: BatcherPosition) => void;
  /** Continue a run after a reload from its saved position. */
  restore?: BatcherPosition;
}

/** Where the upload stands. A formed batch resends with the same seq and content. */
export interface BatcherPosition {
  nextBatchSeq: number;
  sentUpTo: number;
  formedUpTo: number;
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
  /** Wall time of the last successful send (or of start). */
  private lastSentAt = 0;

  constructor(private readonly opts: BatcherOptions) {
    const r = opts.restore;
    if (!r) return;
    this.nextBatchSeq = r.nextBatchSeq;
    this.sentUpTo = r.sentUpTo;
    this.formedUpTo = r.formedUpTo;
    if (r.formedUpTo > r.sentUpTo) {
      this.current = {
        seq: r.nextBatchSeq - 1,
        events: opts.getEvents().slice(r.sentUpTo, r.formedUpTo),
      };
    }
  }

  get position(): BatcherPosition {
    return {
      nextBatchSeq: this.nextBatchSeq,
      sentUpTo: this.sentUpTo,
      formedUpTo: this.formedUpTo,
    };
  }

  start(): void {
    this.stopped = false;
    this.lastSentAt = Date.now();
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
      if (this.formedUpTo >= all.length) {
        // Heartbeats only while running; finish() has nothing left to send.
        const idle = Date.now() - this.lastSentAt >= (this.opts.heartbeatMs ?? 60_000);
        if (this.stopped || !idle) return Promise.resolve();
        this.current = { seq: this.nextBatchSeq++, events: [] };
        return this.sendCurrent();
      }
      const events = all.slice(this.formedUpTo, this.formedUpTo + MAX_EVENTS_PER_BATCH);
      this.current = { seq: this.nextBatchSeq++, events };
      this.formedUpTo += events.length;
      this.opts.onFormed?.(this.position);
    }
    return this.sendCurrent();
  }

  private sendCurrent(): Promise<void> {
    const batch = this.current;
    if (batch === null) return Promise.resolve();
    this.inFlight = this.opts
      .send(batch.seq, batch.events)
      .then(() => {
        this.sentUpTo += batch.events.length;
        this.current = null;
        this.attempt = 0;
        this.lastSentAt = Date.now();
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
