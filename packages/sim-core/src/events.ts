import type { SimEvent, TraineeEventType } from '@vyuh/shared';

// Append-only event log with a monotonic seq (SPEC §4.1/§4.2).

/** Omit that distributes over a union, so each event variant keeps its own shape. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before the log assigns its seq. */
export type EventDraft = DistributiveOmit<SimEvent, 'seq'>;

export type TraineeEvent = Extract<SimEvent, { type: TraineeEventType }>;

export interface EventLog {
  readonly events: SimEvent[];
}

export function createEventLog(): EventLog {
  return { events: [] };
}

export function appendEvent(log: EventLog, draft: EventDraft): SimEvent {
  const event = { ...draft, seq: log.events.length } as SimEvent;
  log.events.push(event);
  return event;
}
