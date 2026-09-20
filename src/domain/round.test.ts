import { describe, it, expect } from 'vitest';
import { createRng } from '../lib/rng';
import { answerOf, factId, lhsText, type Fact } from './facts';
import {
  CARDS_PER_FACT,
  CARDS_PER_ROUND,
  FACTS_PER_ROUND,
  FAKES_PER_FACT,
  buildRound,
  cardClusters,
  gradeRound,
} from './round';

const FACTS: Fact[] = [
  { op: 'mul', left: 7, right: 8 },
  { op: 'add', left: 4, right: 9 },
  { op: 'sub', left: 15, right: 7 },
  { op: 'mul', left: 6, right: 3 },
  { op: 'add', left: 2, right: 3 },
];

const round = (seed = 1) => buildRound(FACTS, createRng(seed));
const trueCards = (seed = 1) => round(seed).cards.filter((c) => c.isTrue);

describe('buildRound', () => {
  it('lays out twenty cards, four per studied fact', () => {
    expect(CARDS_PER_FACT).toBe(4);
    expect(CARDS_PER_ROUND).toBe(20);
    expect(CARDS_PER_ROUND).toBe(FACTS_PER_ROUND * CARDS_PER_FACT);
    expect(round().cards).toHaveLength(CARDS_PER_ROUND);
  });

  it('includes exactly one true card per studied fact', () => {
    const ids = trueCards().map((c) => c.factId);
    expect(ids).toHaveLength(FACTS_PER_ROUND);
    expect(new Set(ids)).toEqual(new Set(FACTS.map(factId)));
  });

  it('gives every studied fact exactly three fakes', () => {
    expect(FAKES_PER_FACT).toBe(3);
    for (let seed = 1; seed <= 30; seed++) {
      const cards = round(seed).cards;
      for (const fact of FACTS) {
        const fakes = cards.filter((c) => c.factId === factId(fact) && !c.isTrue);
        expect(fakes).toHaveLength(FAKES_PER_FACT);
      }
    }
  });

  it('gives every card a unique id', () => {
    const ids = round().cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the studied facts in the order given', () => {
    expect(round().facts).toEqual(FACTS);
  });

  it('puts the real answer on each true card', () => {
    for (const card of trueCards()) {
      expect(card.rhs).toBe(answerOf(card.fact));
    }
  });

  it('never puts the real answer on a fake card', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const card of round(seed).cards.filter((c) => !c.isTrue)) {
        expect(card.rhs).not.toBe(answerOf(card.fact));
      }
    }
  });

  it('gives every card of a fact the same left-hand side', () => {
    const cards = round().cards;
    for (const fact of FACTS) {
      const forFact = cards.filter((c) => c.factId === factId(fact));
      expect(forFact).toHaveLength(CARDS_PER_FACT);
      expect(new Set(forFact.map((c) => lhsText(c.fact)))).toEqual(new Set([lhsText(fact)]));
    }
  });

  it('never repeats a right-hand side within one fact', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const fact of FACTS) {
        const rhs = round(seed)
          .cards.filter((c) => c.factId === factId(fact))
          .map((c) => c.rhs);
        expect(new Set(rhs).size).toBe(rhs.length);
      }
    }
  });

  it('keeps each fact four cards together, so they can be compared side by side', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const cluster of cardClusters(round(seed))) {
        expect(cluster).toHaveLength(CARDS_PER_FACT);
        expect(new Set(cluster.map((c) => c.factId)).size).toBe(1);
        expect(cluster.filter((c) => c.isTrue)).toHaveLength(1);
      }
    }
  });

  it('never lays the clusters out in the order the facts were studied', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const built = round(seed);
      const laidOut = cardClusters(built).map((cluster) => cluster[0]!.factId);
      expect(laidOut).not.toEqual(built.facts.map(factId));
    }
  });

  it('varies which fact leads the grid', () => {
    const leaders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) leaders.add(round(seed).cards[0]!.factId);
    expect(leaders.size).toBeGreaterThan(2);
  });

  it('varies where the true card sits inside its cluster', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      for (const cluster of cardClusters(round(seed))) {
        positions.add(cluster.findIndex((c) => c.isTrue));
      }
    }
    expect(positions.size).toBe(CARDS_PER_FACT);
  });

  it('splits the cards into one cluster per studied fact', () => {
    expect(cardClusters(round())).toHaveLength(FACTS_PER_ROUND);
  });

  it('is deterministic for a given seed', () => {
    expect(round(12)).toEqual(round(12));
  });

  it('rejects the wrong number of facts', () => {
    expect(() => buildRound(FACTS.slice(0, 4), createRng(1))).toThrow();
  });

  it('rejects duplicate facts, which would collide as cards', () => {
    const dupes: Fact[] = [FACTS[0]!, FACTS[0]!, FACTS[1]!, FACTS[2]!, FACTS[3]!];
    expect(() => buildRound(dupes, createRng(1))).toThrow();
  });
});

describe('gradeRound', () => {
  const built = round(3);
  const idsOf = (predicate: (isTrue: boolean) => boolean, factIndex?: number) =>
    built.cards
      .filter(
        (c) =>
          predicate(c.isTrue) &&
          (factIndex === undefined || c.factId === factId(FACTS[factIndex]!)),
      )
      .map((c) => c.id);

  const allTrueIds = idsOf((t) => t);

  it('scores a clean sweep as perfect', () => {
    const result = gradeRound(built, allTrueIds);
    expect(result.score).toBe(5);
    expect(result.perfect).toBe(true);
    expect(result.verdicts.every((v) => v.correct)).toBe(true);
  });

  it('scores an empty selection as zero', () => {
    const result = gradeRound(built, []);
    expect(result.score).toBe(0);
    expect(result.perfect).toBe(false);
  });

  it('marks a fact wrong when its true card was not picked', () => {
    // Target the first studied fact explicitly: the cards are shuffled, so the
    // first true card in grid order belongs to whichever fact landed there.
    const firstFactTrueCard = idsOf((t) => t, 0)[0]!;
    const result = gradeRound(
      built,
      allTrueIds.filter((id) => id !== firstFactTrueCard),
    );
    expect(result.score).toBe(4);
    expect(result.perfect).toBe(false);
    const verdict = result.verdicts.find((v) => v.factId === factId(FACTS[0]!));
    expect(verdict?.correct).toBe(false);
    expect(verdict?.pickedTrueCard).toBe(false);
  });

  it('marks a fact wrong when a fake of it was also picked', () => {
    const withOneFake = [...allTrueIds, idsOf((t) => !t, 0)[0]!];
    const result = gradeRound(built, withOneFake);
    const verdict = result.verdicts.find((v) => v.factId === factId(FACTS[0]!));
    expect(verdict?.correct).toBe(false);
    expect(verdict?.pickedTrueCard).toBe(true);
    expect(verdict?.pickedFakes).toBe(1);
    expect(result.score).toBe(4);
  });

  it('marks a fact wrong when only a fake of it was picked', () => {
    const result = gradeRound(built, [idsOf((t) => !t, 2)[0]!]);
    const verdict = result.verdicts.find((v) => v.factId === factId(FACTS[2]!));
    expect(verdict?.correct).toBe(false);
    expect(verdict?.pickedTrueCard).toBe(false);
    expect(verdict?.pickedFakes).toBe(1);
    expect(result.score).toBe(0);
  });

  it('reports verdicts in the order the facts were studied', () => {
    const result = gradeRound(built, allTrueIds);
    expect(result.verdicts.map((v) => v.factId)).toEqual(FACTS.map(factId));
  });

  it('ignores a repeated selection of the same card', () => {
    const result = gradeRound(built, [...allTrueIds, ...allTrueIds]);
    expect(result.score).toBe(5);
  });

  it('rejects a card id that is not in the round', () => {
    expect(() => gradeRound(built, ['mul:1x1#99'])).toThrow();
  });

  it('records which cards were selected, for the reveal screen', () => {
    const picked = allTrueIds.slice(0, 2);
    const result = gradeRound(built, picked);
    expect([...result.selectedCardIds].sort()).toEqual([...picked].sort());
  });
});
