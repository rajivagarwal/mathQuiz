import { describe, it, expect } from 'vitest';
import { createRng } from '../lib/rng';
import { answerOf, factId, type Fact } from './facts';
import { FACTS_PER_ROUND } from './round';
import { DECOY_TILES, TILES_PER_ROUND, buildDragRound, gradeDragRound } from './dragRound';

const FACTS: Fact[] = [
  { op: 'mul', left: 7, right: 8 },
  { op: 'add', left: 4, right: 9 },
  { op: 'sub', left: 15, right: 7 },
  { op: 'mul', left: 6, right: 3 },
  { op: 'add', left: 2, right: 3 },
];

const round = (seed = 1) => buildDragRound(FACTS, createRng(seed));
const tileFor = (seed: number, fact: Fact) =>
  round(seed).tiles.find((tile) => tile.factId === factId(fact))!;

/** Places the right tile in every slot. */
const allCorrect = (seed: number) =>
  new Map(FACTS.map((fact) => [factId(fact), tileFor(seed, fact).id]));

describe('buildDragRound', () => {
  it('offers eight tiles: five real answers and three decoys', () => {
    expect(TILES_PER_ROUND).toBe(FACTS_PER_ROUND + DECOY_TILES);
    expect(DECOY_TILES).toBe(3);
    expect(round().tiles).toHaveLength(TILES_PER_ROUND);
  });

  it('gives each studied fact exactly one tile carrying its real answer', () => {
    const tiles = round().tiles;
    for (const fact of FACTS) {
      const own = tiles.filter((tile) => tile.factId === factId(fact));
      expect(own).toHaveLength(1);
      expect(own[0]?.value).toBe(answerOf(fact));
    }
  });

  it('marks the three decoys as belonging to no equation', () => {
    expect(round().tiles.filter((tile) => tile.factId === null)).toHaveLength(DECOY_TILES);
  });

  it('never gives a decoy the same value as a real answer', () => {
    const answers = new Set(FACTS.map(answerOf));
    for (let seed = 1; seed <= 40; seed++) {
      for (const tile of round(seed).tiles.filter((t) => t.factId === null)) {
        expect(answers.has(tile.value)).toBe(false);
      }
    }
  });

  it('keeps every tile value distinct, so no two tiles are interchangeable', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const values = round(seed).tiles.map((tile) => tile.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('draws decoys close to the answers on offer, not from nowhere', () => {
    const answers = FACTS.map(answerOf);
    for (let seed = 1; seed <= 40; seed++) {
      for (const tile of round(seed).tiles.filter((t) => t.factId === null)) {
        const nearest = Math.min(...answers.map((a) => Math.abs(a - tile.value)));
        expect(nearest).toBeLessThanOrEqual(9);
      }
    }
  });

  it('gives every tile a unique id', () => {
    const ids = round().tiles.map((tile) => tile.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shuffles the tray', () => {
    const leading = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) leading.add(round(seed).tiles[0]!.value);
    expect(leading.size).toBeGreaterThan(2);
  });

  it('keeps the studied facts in order', () => {
    expect(round().facts).toEqual(FACTS);
  });

  it('asks about exactly the facts that were studied', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const built = round(seed);
      expect(built.prompts.map(factId).sort()).toEqual(built.facts.map(factId).sort());
    }
  });

  it('never asks the equations in the order they were studied', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const built = round(seed);
      expect(built.prompts.map(factId)).not.toEqual(built.facts.map(factId));
    }
  });

  it('varies the recall order between rounds', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) orders.add(round(seed).prompts.map(factId).join());
    expect(orders.size).toBeGreaterThan(2);
  });

  it('is deterministic for a given seed', () => {
    expect(round(12)).toEqual(round(12));
  });

  it('rejects the wrong number of facts', () => {
    expect(() => buildDragRound(FACTS.slice(0, 4), createRng(1))).toThrow();
  });
});

describe('gradeDragRound', () => {
  const built = round(3);

  it('scores every slot filled correctly as perfect', () => {
    const result = gradeDragRound(built, allCorrect(3));
    expect(result.score).toBe(FACTS_PER_ROUND);
    expect(result.perfect).toBe(true);
  });

  it('scores an empty board as zero', () => {
    const result = gradeDragRound(built, new Map());
    expect(result.score).toBe(0);
    expect(result.perfect).toBe(false);
    expect(result.verdicts.every((v) => v.placedValue === null)).toBe(true);
  });

  it('marks a slot wrong when it holds another equation answer', () => {
    const placements = allCorrect(3);
    placements.set(factId(FACTS[0]!), tileFor(3, FACTS[1]!).id);
    const result = gradeDragRound(built, placements);
    const verdict = result.verdicts.find((v) => v.factId === factId(FACTS[0]!));
    expect(verdict?.correct).toBe(false);
    expect(verdict?.placedValue).toBe(answerOf(FACTS[1]!));
    expect(result.score).toBe(4);
  });

  it('marks a slot wrong when it holds a decoy', () => {
    const decoy = built.tiles.find((tile) => tile.factId === null)!;
    const result = gradeDragRound(built, new Map([[factId(FACTS[2]!), decoy.id]]));
    const verdict = result.verdicts.find((v) => v.factId === factId(FACTS[2]!));
    expect(verdict?.correct).toBe(false);
    expect(verdict?.placedValue).toBe(decoy.value);
  });

  it('marks an untouched slot wrong', () => {
    const placements = allCorrect(3);
    placements.delete(factId(FACTS[4]!));
    const result = gradeDragRound(built, placements);
    expect(result.verdicts.find((v) => v.factId === factId(FACTS[4]!))?.correct).toBe(false);
    expect(result.score).toBe(4);
  });

  it('reports verdicts in the order the facts were studied', () => {
    const result = gradeDragRound(built, allCorrect(3));
    expect(result.verdicts.map((v) => v.factId)).toEqual(FACTS.map(factId));
  });

  it('rejects a tile that is not in this round', () => {
    expect(() => gradeDragRound(built, new Map([[factId(FACTS[0]!), 'tile-nope']]))).toThrow();
  });

  it('rejects a slot that is not in this round', () => {
    const tile = built.tiles[0]!;
    expect(() => gradeDragRound(built, new Map([['mul:1x1', tile.id]]))).toThrow();
  });
});
