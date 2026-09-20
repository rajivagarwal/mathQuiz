/**
 * Building a round's card grid, and grading what the child picked.
 *
 * A round studies five true equations, then shows each of them beside three
 * fakes -- twenty cards sharing only five left-hand sides. Recognising the true
 * one therefore requires having actually remembered it.
 *
 * The cards stay clustered by left-hand side rather than scattered, so the four
 * candidates for `7 x 8` sit together and can be weighed against each other.
 */

import { reorder, type Rng } from '../lib/rng';
import { answerOf, factId, type Fact } from './facts';
import { fakeAnswers } from './distractors';

export const FACTS_PER_ROUND = 5;
export const FAKES_PER_FACT = 3;

/** One true card plus its fakes. */
export const CARDS_PER_FACT = 1 + FAKES_PER_FACT;
export const CARDS_PER_ROUND = FACTS_PER_ROUND * CARDS_PER_FACT;

/** The child may hold at most five selections -- one per studied fact. */
export const MAX_SELECTIONS = FACTS_PER_ROUND;

export interface Card {
  /** Unique within a round: the fact plus its right-hand side. */
  readonly id: string;
  readonly factId: string;
  readonly fact: Fact;
  readonly rhs: number;
  readonly isTrue: boolean;
}

export interface Round {
  /** The five facts, in the order they were studied. */
  readonly facts: readonly Fact[];
  /** Fifteen cards, shuffled. */
  readonly cards: readonly Card[];
}

function makeCard(fact: Fact, id: string, rhs: number, isTrue: boolean): Card {
  return { id: `${id}#${rhs}`, factId: id, fact, rhs, isTrue };
}



export function buildRound(facts: readonly Fact[], rng: Rng): Round {
  if (facts.length !== FACTS_PER_ROUND) {
    throw new Error(`A round needs exactly ${FACTS_PER_ROUND} facts, got ${facts.length}`);
  }

  const ids = facts.map(factId);
  if (new Set(ids).size !== ids.length) {
    throw new Error('A round cannot study the same fact twice');
  }

  const clusters = facts.map((fact, index) => {
    const id = ids[index] as string;
    const cluster = [makeCard(fact, id, answerOf(fact), true)];
    for (const fake of fakeAnswers(fact, FAKES_PER_FACT, rng)) {
      cluster.push(makeCard(fact, id, fake, false));
    }
    // Shuffle inside the cluster so the true card is not always first, and
    // shuffle the clusters so the grid does not mirror the study order.
    return rng.shuffle(cluster);
  });

  return { facts: [...facts], cards: reorder(clusters, rng).flat() };
}

/** The cards grouped as they are laid out: one group per studied fact. */
export function cardClusters(round: Round): Card[][] {
  const clusters: Card[][] = [];
  for (let index = 0; index < round.cards.length; index += CARDS_PER_FACT) {
    clusters.push(round.cards.slice(index, index + CARDS_PER_FACT));
  }
  return clusters;
}

export interface FactVerdict {
  readonly factId: string;
  readonly fact: Fact;
  /** True only if the real card was picked and neither fake was. */
  readonly correct: boolean;
  readonly pickedTrueCard: boolean;
  readonly pickedFakes: number;
}

export interface RoundResult {
  /** One per studied fact, in study order. */
  readonly verdicts: readonly FactVerdict[];
  readonly selectedCardIds: readonly string[];
  /** How many of the five facts were got right. */
  readonly score: number;
  readonly perfect: boolean;
}

/**
 * A fact counts as correct only when the child picked its true card and picked
 * neither of its fakes -- so picking everything scores zero, not five.
 */
export function gradeRound(round: Round, selectedCardIds: readonly string[]): RoundResult {
  const known = new Set(round.cards.map((card) => card.id));
  const selected = new Set<string>();
  for (const id of selectedCardIds) {
    if (!known.has(id)) throw new Error(`Card ${id} is not part of this round`);
    selected.add(id);
  }

  const verdicts: FactVerdict[] = round.facts.map((fact) => {
    const id = factId(fact);
    const cards = round.cards.filter((card) => card.factId === id);
    const pickedTrueCard = cards.some((card) => card.isTrue && selected.has(card.id));
    const pickedFakes = cards.filter((card) => !card.isTrue && selected.has(card.id)).length;

    return {
      factId: id,
      fact,
      correct: pickedTrueCard && pickedFakes === 0,
      pickedTrueCard,
      pickedFakes,
    };
  });

  const score = verdicts.filter((verdict) => verdict.correct).length;

  return {
    verdicts,
    selectedCardIds: [...selected],
    score,
    perfect: score === FACTS_PER_ROUND,
  };
}
