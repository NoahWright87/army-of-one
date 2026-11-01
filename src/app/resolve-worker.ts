/**
 * Web Worker hosting the background resolve pass ([D23]). Started per pass by
 * `createWorkerResolveRunner` (resolve-runner.ts); it streams progressive observations and the
 * snapshots it makes (plain data, ~3 KB each on mission-01) back to the main thread, which
 * commits them to the mission's SnapshotStore. Cancelling terminates the worker.
 */
import {
  createResolveDriver,
  PACE_SLICE_MS,
  sliceTicks,
  type FromWorker,
  type ToWorker,
} from './resolve-runner';

const TICKS_PER_SLICE = 600;
const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.type !== 'start') return;
  try {
    const driver = createResolveDriver(m.req, {
      onProgress: (obs, snapshots) => post({ type: 'progress', obs, snapshots }),
      onDone: (obs, snapshots) => post({ type: 'done', obs, snapshots }),
    });
    // The worker has its own thread: flat out (a slice at a time so messages flush), or paced
    // so the scrubber visibly sweeps.
    const ticks = sliceTicks(m.req.pace, TICKS_PER_SLICE);
    const delay = m.req.pace ? PACE_SLICE_MS : 0;
    const loop = () => {
      try {
        if (!driver.slice(ticks)) setTimeout(loop, delay);
      } catch (e) {
        post({ type: 'error', message: String(e) });
      }
    };
    loop();
  } catch (e) {
    post({ type: 'error', message: String(e) });
  }
};
