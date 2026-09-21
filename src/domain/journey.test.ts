import { describe, it, expect } from 'vitest';
import {
  COINS_PER_STEP,
  STEPS_PER_DIAMOND,
  coinsAtStep,
  coinsForAttempt,
  completeStep,
  completedSteps,
  currentStep,
  diamonds,
  emptyJourney,
  isDiamondStep,
  stepsUntilDiamond,
  totalCoins,
  type Journey,
} from './journey';

/** A journey that has finished the given steps, earning those coins. */
const after = (...coins: number[]): Journey => ({ stepCoins: coins });

describe('a journey not yet begun', () => {
  const journey = emptyJourney();

  it('starts on the first step', () => {
    expect(currentStep(journey)).toBe(1);
    expect(completedSteps(journey)).toBe(0);
  });

  it('has won nothing', () => {
    expect(totalCoins(journey)).toBe(0);
    expect(diamonds(journey)).toBe(0);
  });

  it('is a full diamond away from the first one', () => {
    expect(stepsUntilDiamond(journey)).toBe(STEPS_PER_DIAMOND);
  });
});

describe('coinsForAttempt', () => {
  it('pays the full reward for getting it right first time', () => {
    expect(COINS_PER_STEP).toBe(5);
    expect(coinsForAttempt(1)).toBe(COINS_PER_STEP);
  });

  it('costs one coin per retry', () => {
    expect(coinsForAttempt(2)).toBe(4);
    expect(coinsForAttempt(3)).toBe(3);
    expect(coinsForAttempt(4)).toBe(2);
    expect(coinsForAttempt(5)).toBe(1);
  });

  it('never drops below a single coin, however many tries it takes', () => {
    expect(coinsForAttempt(6)).toBe(1);
    expect(coinsForAttempt(50)).toBe(1);
  });

  it('treats a nonsensical attempt count as the first try', () => {
    expect(coinsForAttempt(0)).toBe(COINS_PER_STEP);
    expect(coinsForAttempt(-3)).toBe(COINS_PER_STEP);
  });
});

describe('completing a step', () => {
  it('moves on to the next one', () => {
    const journey = completeStep(emptyJourney(), 1);
    expect(completedSteps(journey)).toBe(1);
    expect(currentStep(journey)).toBe(2);
  });

  it('banks the coins the attempt was worth', () => {
    expect(totalCoins(completeStep(emptyJourney(), 1))).toBe(5);
    expect(totalCoins(completeStep(emptyJourney(), 3))).toBe(3);
  });

  it('adds to what was already won', () => {
    let journey = completeStep(emptyJourney(), 1);
    journey = completeStep(journey, 4);
    expect(journey.stepCoins).toEqual([5, 2]);
    expect(totalCoins(journey)).toBe(7);
  });

  it('does not mutate the journey it is given', () => {
    const before = emptyJourney();
    completeStep(before, 1);
    expect(before.stepCoins).toEqual([]);
  });
});

describe('diamonds', () => {
  it('arrive every fifth step', () => {
    expect(STEPS_PER_DIAMOND).toBe(5);
    expect(diamonds(after(5, 5, 5, 5))).toBe(0);
    expect(diamonds(after(5, 5, 5, 5, 5))).toBe(1);
    expect(diamonds(after(5, 5, 5, 5, 5, 5, 5, 5, 5))).toBe(1);
    expect(diamonds(after(5, 5, 5, 5, 5, 5, 5, 5, 5, 5))).toBe(2);
  });

  it('do not depend on how many coins were won', () => {
    expect(diamonds(after(1, 1, 1, 1, 1))).toBe(1);
  });

  it('name the step that earns one', () => {
    expect(isDiamondStep(5)).toBe(true);
    expect(isDiamondStep(10)).toBe(true);
    for (const step of [1, 2, 3, 4, 6, 9, 11]) expect(isDiamondStep(step)).toBe(false);
  });

  it('count down to the next one', () => {
    expect(stepsUntilDiamond(after(5))).toBe(4);
    expect(stepsUntilDiamond(after(5, 5, 5, 5))).toBe(1);
    expect(stepsUntilDiamond(after(5, 5, 5, 5, 5))).toBe(5);
  });
});

describe('coinsAtStep', () => {
  it('reports what a finished step was worth', () => {
    const journey = after(5, 3, 1);
    expect(coinsAtStep(journey, 1)).toBe(5);
    expect(coinsAtStep(journey, 2)).toBe(3);
    expect(coinsAtStep(journey, 3)).toBe(1);
  });

  it('reports nothing for a step not yet finished', () => {
    const journey = after(5);
    expect(coinsAtStep(journey, 2)).toBeNull();
    expect(coinsAtStep(journey, 99)).toBeNull();
    expect(coinsAtStep(journey, 0)).toBeNull();
  });
});

describe('a journey restored from nonsense', () => {
  it('survives coin counts that are not numbers', () => {
    const journey = { stepCoins: [5, 'x', null, 3] } as unknown as Journey;
    expect(() => totalCoins(journey)).not.toThrow();
    expect(Number.isFinite(totalCoins(journey))).toBe(true);
    expect(totalCoins(journey)).toBe(8);
  });
});
