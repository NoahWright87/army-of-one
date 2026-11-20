interface FrameLoop {
  readonly running: boolean;
  wake(): void;
  sleep(): void;
}

/** The loader's pending queue needs frame updates even behind a DOM menu. */
export function createIdleLoop(
  loop: FrameLoop,
  imagesReady: () => boolean,
  battlePendingOrActive: () => boolean,
): { wake(): void; sleepSoon(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    wake: () => {
      cancel();
      if (!loop.running) loop.wake();
    },
    sleepSoon: () => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        if (imagesReady() && !battlePendingOrActive()) loop.sleep();
      }, 200);
    },
  };
}
