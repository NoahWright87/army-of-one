import type { SimEvent } from './events';

/** Fixed-capacity ring buffer of recent events (oldest dropped first). */
export interface EventLog {
  capacity: number;
  items: SimEvent[];
  /** Index of the oldest item once the buffer is full. */
  start: number;
}

export function createEventLog(capacity: number): EventLog {
  return { capacity: Math.max(1, capacity), items: [], start: 0 };
}

export function appendEvents(log: EventLog, events: readonly SimEvent[]): void {
  for (const e of events) {
    if (log.items.length < log.capacity) {
      log.items.push(e);
    } else {
      log.items[log.start] = e;
      log.start = (log.start + 1) % log.capacity;
    }
  }
}

/** Retained events, oldest first. */
export function eventLogContents(log: EventLog): SimEvent[] {
  return [...log.items.slice(log.start), ...log.items.slice(0, log.start)];
}
