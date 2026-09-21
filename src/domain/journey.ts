/**
 * The progress map: a line of steps, each cleared by getting all five facts
 * right in one go.
 *
 * Only the coins won at each finished step are stored. The step reached, the
 * total, and the diamonds all follow from that one list, so there is no second
 * copy to drift out of step with it.
 *
 * What is deliberately *not* here is the attempt counter and the five facts
 * being worked on. Those live in memory for the session only, which is what
 * makes closing the app deal a fresh hand at full price.
 */

export const COINS_PER_STEP = 5;
export const STEPS_PER_DIAMOND = 5;

export interface Journey {
  /** Coins won at each completed step, oldest first. */
  readonly stepCoins: readonly number[];
}

export function emptyJourney(): Journey {
  return { stepCoins: [] };
}

export function completedSteps(journey: Journey): number {
  return journey.stepCoins.length;
}

export function currentStep(journey: Journey): number {
  return completedSteps(journey) + 1;
}

/** Stored coins are untrusted, so anything unusable counts as nothing. */
export function totalCoins(journey: Journey): number {
  return journey.stepCoins.reduce<number>(
    (sum, coins) => sum + (typeof coins === 'number' && Number.isFinite(coins) ? coins : 0),
    0,
  );
}

export function diamonds(journey: Journey): number {
  return Math.floor(completedSteps(journey) / STEPS_PER_DIAMOND);
}

/** Full price first time, a coin less per retry, never below one. */
export function coinsForAttempt(attempt: number): number {
  const tries = Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1;
  return Math.max(1, COINS_PER_STEP - (tries - 1));
}

export function completeStep(journey: Journey, attempt: number): Journey {
  return { stepCoins: [...journey.stepCoins, coinsForAttempt(attempt)] };
}

export function isDiamondStep(step: number): boolean {
  return step > 0 && step % STEPS_PER_DIAMOND === 0;
}

export function stepsUntilDiamond(journey: Journey): number {
  return STEPS_PER_DIAMOND - (completedSteps(journey) % STEPS_PER_DIAMOND);
}

/** What a finished step was worth, or null if it has not been finished. */
export function coinsAtStep(journey: Journey, step: number): number | null {
  if (step < 1 || step > completedSteps(journey)) return null;
  return journey.stepCoins[step - 1] ?? null;
}
