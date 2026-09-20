/**
 * The phase timer.
 *
 * Time is read from an injected clock rather than counted in frames, so a
 * dropped or slow frame cannot make the countdown drift. The clock and the
 * frame scheduler are both injected so this is testable without a browser.
 */

export interface CountdownOptions {
  readonly durationMs: number;
  readonly now: () => number;
  readonly schedule: (callback: () => void) => number;
  readonly cancel: (handle: number) => void;
  readonly onTick: (remainingMs: number) => void;
  readonly onDone: () => void;
}

export interface Countdown {
  start(): void;
  /** Ends the countdown without firing `onDone`. */
  stop(): void;
  remainingMs(): number;
  /** How long it ran, capped at the duration. */
  elapsedMs(): number;
}

export function createCountdown(options: CountdownOptions): Countdown {
  const { durationMs, now, schedule, cancel, onTick, onDone } = options;

  let startedAt: number | null = null;
  let handle: number | null = null;
  let finished = false;
  /** Set once the countdown ends, so elapsed time stops moving with the clock. */
  let frozenElapsed: number | null = null;

  const elapsedMs = (): number => {
    if (frozenElapsed !== null) return frozenElapsed;
    if (startedAt === null) return 0;
    return Math.min(now() - startedAt, durationMs);
  };

  const remainingMs = (): number => durationMs - elapsedMs();

  const frame = (): void => {
    handle = null;
    if (finished || startedAt === null) return;

    const remaining = remainingMs();
    onTick(remaining);

    if (remaining <= 0) {
      finished = true;
      frozenElapsed = durationMs;
      onDone();
      return;
    }

    handle = schedule(frame);
  };

  return {
    start() {
      if (startedAt !== null) return;
      startedAt = now();
      frozenElapsed = null;
      finished = false;
      handle = schedule(frame);
    },

    stop() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      if (startedAt !== null && frozenElapsed === null) frozenElapsed = elapsedMs();
    },

    remainingMs,
    elapsedMs,
  };
}

/** A countdown wired to the real browser clock and frame loop. */
export function browserCountdown(
  durationMs: number,
  onTick: (remainingMs: number) => void,
  onDone: () => void,
): Countdown {
  return createCountdown({
    durationMs,
    now: () => performance.now(),
    schedule: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
    onTick,
    onDone,
  });
}
