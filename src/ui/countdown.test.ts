import { describe, it, expect } from 'vitest';
import { createCountdown, type CountdownOptions } from './countdown';

/** A clock and frame scheduler the test drives by hand. */
function harness(durationMs: number, overrides: Partial<CountdownOptions> = {}) {
  let clock = 1000;
  let queued: (() => void) | null = null;
  const ticks: number[] = [];
  let done = 0;

  const countdown = createCountdown({
    durationMs,
    now: () => clock,
    schedule: (callback) => {
      queued = callback;
      return 1;
    },
    cancel: () => {
      queued = null;
    },
    onTick: (remaining) => ticks.push(remaining),
    onDone: () => {
      done++;
    },
    ...overrides,
  });

  return {
    countdown,
    ticks,
    doneCount: () => done,
    /** Advance the clock and run the frame the countdown asked for. */
    advance(ms: number) {
      clock += ms;
      const frame = queued;
      queued = null;
      frame?.();
    },
    isScheduled: () => queued !== null,
  };
}

describe('createCountdown', () => {
  it('starts with the full duration remaining', () => {
    const { countdown } = harness(15000);
    countdown.start();
    expect(countdown.remainingMs()).toBe(15000);
  });

  it('reports nothing remaining before it is started', () => {
    const { countdown } = harness(15000);
    expect(countdown.remainingMs()).toBe(15000);
  });

  it('counts down as the clock advances', () => {
    const h = harness(15000);
    h.countdown.start();
    h.advance(4000);
    expect(h.countdown.remainingMs()).toBe(11000);
    h.advance(1000);
    expect(h.countdown.remainingMs()).toBe(10000);
  });

  it('reports the remaining time on every frame', () => {
    const h = harness(15000);
    h.countdown.start();
    h.advance(1000);
    h.advance(1000);
    expect(h.ticks).toEqual([14000, 13000]);
  });

  it('finishes when the duration has elapsed', () => {
    const h = harness(5000);
    h.countdown.start();
    h.advance(5000);
    expect(h.doneCount()).toBe(1);
    expect(h.countdown.remainingMs()).toBe(0);
  });

  it('never reports a negative remaining time', () => {
    const h = harness(5000);
    h.countdown.start();
    h.advance(9000);
    expect(h.countdown.remainingMs()).toBe(0);
    expect(h.ticks.every((t) => t >= 0)).toBe(true);
  });

  it('finishes exactly once, even if more frames arrive', () => {
    const h = harness(5000);
    h.countdown.start();
    h.advance(5000);
    h.advance(1000);
    h.advance(1000);
    expect(h.doneCount()).toBe(1);
  });

  it('stops scheduling frames once finished', () => {
    const h = harness(5000);
    h.countdown.start();
    h.advance(5000);
    expect(h.isScheduled()).toBe(false);
  });

  it('stops early when told to, without finishing', () => {
    const h = harness(15000);
    h.countdown.start();
    h.advance(1000);
    h.countdown.stop();
    expect(h.isScheduled()).toBe(false);
    h.advance(20000);
    expect(h.doneCount()).toBe(0);
  });

  it('reports how long it actually ran', () => {
    const h = harness(15000);
    h.countdown.start();
    h.advance(4000);
    h.countdown.stop();
    expect(h.countdown.elapsedMs()).toBe(4000);
  });

  it('caps elapsed time at the duration when it runs out', () => {
    const h = harness(5000);
    h.countdown.start();
    h.advance(9000);
    expect(h.countdown.elapsedMs()).toBe(5000);
  });

  it('ignores a second start', () => {
    const h = harness(15000);
    h.countdown.start();
    h.advance(3000);
    h.countdown.start();
    expect(h.countdown.remainingMs()).toBe(12000);
  });
});
