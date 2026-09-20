/**
 * Fake right-hand sides for the recall grid.
 *
 * Two rules make the game work:
 *
 * 1. A fake must sit inside the operation's natural answer range. A fake of
 *    `15 - 7 = 12` can be dismissed without remembering anything, because a
 *    subtraction answer here is always a single digit. Same for a product above
 *    81. Range leaks turn a memory test into an elimination puzzle.
 *
 * 2. A fake should look like a mistake someone would actually make -- an
 *    adjacent multiple, an off-by-one, a botched borrow -- not a random number.
 */

import type { Rng } from '../lib/rng';
import { answerOf, answerRange, type Fact } from './facts';

/**
 * Candidates grouped most-plausible-first. Each tier is shuffled before use, so
 * the same fact does not always show the same fakes, while the strongest
 * candidates are still preferred.
 */
function candidateTiers(fact: Fact, truth: number): number[][] {
  switch (fact.op) {
    case 'mul':
      // Adjacent multiples: the classic times-table slip, and a real product.
      return [
        [truth + fact.left, truth - fact.left, truth + fact.right, truth - fact.right],
        [truth + 1, truth - 1, truth + 2, truth - 2],
      ];

    case 'add':
      return [
        [truth + 1, truth - 1, truth + 2, truth - 2],
        [truth + 3, truth - 3],
      ];

    case 'sub': {
      const near = [truth + 1, truth - 1];
      // Botched borrow: subtracting the smaller digit from the larger, so
      // 15 - 7 becomes |5 - 7| = 2.
      if (fact.left >= 10) near.push(Math.abs((fact.left % 10) - fact.right));
      return [near, [truth + 2, truth - 2]];
    }
  }
}

/**
 * `count` distinct wrong answers for `fact`, none equal to the true answer and
 * all inside the operation's answer range.
 */
export function fakeAnswers(fact: Fact, count: number, rng: Rng): number[] {
  const truth = answerOf(fact);
  const { min, max } = answerRange(fact.op);

  // Every value in range except the true answer.
  const capacity = max - min;
  if (count > capacity) {
    throw new Error(
      `Cannot produce ${count} distinct fakes for ${fact.op}: only ${capacity} values available`,
    );
  }

  const chosen: number[] = [];
  const taken = new Set<number>([truth]);

  const accept = (value: number): void => {
    if (value < min || value > max || taken.has(value)) return;
    taken.add(value);
    chosen.push(value);
  };

  for (const tier of candidateTiers(fact, truth)) {
    if (chosen.length >= count) break;
    for (const candidate of rng.shuffle(tier)) {
      if (chosen.length >= count) break;
      accept(candidate);
    }
  }

  // Facts at the edge of their range (2 - 1, 1 x 1) lose most near-miss
  // candidates to the range check. Top up from anywhere valid.
  if (chosen.length < count) {
    const remaining: number[] = [];
    for (let value = min; value <= max; value++) {
      if (!taken.has(value)) remaining.push(value);
    }
    for (const candidate of rng.shuffle(remaining)) {
      if (chosen.length >= count) break;
      accept(candidate);
    }
  }

  return chosen;
}
