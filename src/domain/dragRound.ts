/**
 * The second game type: the five studied equations reappear with their answers
 * removed, and the answers come back as loose tiles to be put where they belong.
 *
 * The tray holds three more tiles than there are equations. Without the spares,
 * the last tile would place itself and part of the round could be solved by
 * elimination instead of memory.
 */

import { reorder, type Rng } from '../lib/rng';
import { answerOf, answerRange, factId, type Fact } from './facts';
import { fakeAnswers } from './distractors';
import { FACTS_PER_ROUND } from './round';

export const DECOY_TILES = 3;
export const TILES_PER_ROUND = FACTS_PER_ROUND + DECOY_TILES;

/** How many near-misses each equation contributes to the decoy pool. */
const DECOY_CANDIDATES_PER_FACT = 4;

/** How far from a real answer a fallback decoy may sit. */
const DECOY_MAX_DISTANCE = 9;

export interface Tile {
  readonly id: string;
  readonly value: number;
  /** The equation this tile answers, or null when it answers none of them. */
  readonly factId: string | null;
}

export interface DragRound {
  /** The five equations, in the order they were studied. */
  readonly facts: readonly Fact[];
  /**
   * The same five, reordered for the recall phase. Without this the equations
   * would sit exactly where they did during study, and their position would
   * carry the answer as reliably as memory does.
   */
  readonly prompts: readonly Fact[];
  /** Eight tiles, shuffled. */
  readonly tiles: readonly Tile[];
}

export function buildDragRound(facts: readonly Fact[], rng: Rng): DragRound {
  if (facts.length !== FACTS_PER_ROUND) {
    throw new Error(`A round needs exactly ${FACTS_PER_ROUND} facts, got ${facts.length}`);
  }

  const ids = facts.map(factId);
  if (new Set(ids).size !== ids.length) {
    throw new Error('A round cannot study the same fact twice');
  }

  // Every tile value is distinct, so no two tiles are interchangeable and a
  // tile id can simply be its value.
  const taken = new Set<number>();
  const tiles: Tile[] = facts.map((fact, index) => {
    const value = answerOf(fact);
    taken.add(value);
    return { id: `tile:${value}`, value, factId: ids[index] as string };
  });

  // Decoys are drawn from the near-misses of the equations on offer, so a spare
  // tile is the kind of wrong answer a child might half-remember. Any candidate
  // equal to a real answer is dropped: it would be a valid placement elsewhere.
  const pool: number[] = [];
  for (const fact of facts) {
    pool.push(...fakeAnswers(fact, DECOY_CANDIDATES_PER_FACT, rng));
  }

  const decoys: number[] = [];
  const collect = (candidates: readonly number[]): void => {
    for (const value of rng.shuffle(candidates)) {
      if (decoys.length >= DECOY_TILES) return;
      if (taken.has(value)) continue;
      taken.add(value);
      decoys.push(value);
    }
  };

  collect(pool);

  // Should the near-misses collide with the real answers, widen the search --
  // still close to an answer, so a spare never looks obviously out of place.
  if (decoys.length < DECOY_TILES) {
    const nearby: number[] = [];
    for (const fact of facts) {
      const truth = answerOf(fact);
      const { min, max } = answerRange(fact.op);
      for (let delta = 1; delta <= DECOY_MAX_DISTANCE; delta++) {
        for (const value of [truth - delta, truth + delta]) {
          if (value >= min && value <= max) nearby.push(value);
        }
      }
    }
    collect(nearby);
  }

  if (decoys.length < DECOY_TILES) {
    throw new Error(`Cannot build ${DECOY_TILES} spare tiles for this round`);
  }

  for (const value of decoys) {
    tiles.push({ id: `tile:${value}`, value, factId: null });
  }

  return { facts: [...facts], prompts: reorder(facts, rng), tiles: rng.shuffle(tiles) };
}

export interface DragVerdict {
  readonly factId: string;
  readonly fact: Fact;
  readonly correct: boolean;
  /** What ended up in the slot, or null if nothing did. */
  readonly placedValue: number | null;
}

export interface DragResult {
  /** One per studied fact, in study order. */
  readonly verdicts: readonly DragVerdict[];
  readonly placements: ReadonlyMap<string, string>;
  readonly score: number;
  readonly perfect: boolean;
}

/** `placements` maps a fact id to the id of the tile dropped on it. */
export function gradeDragRound(
  round: DragRound,
  placements: ReadonlyMap<string, string>,
): DragResult {
  const tilesById = new Map(round.tiles.map((tile) => [tile.id, tile]));
  const slots = new Set(round.facts.map(factId));

  for (const [slot, tileId] of placements) {
    if (!slots.has(slot)) throw new Error(`Equation ${slot} is not part of this round`);
    if (!tilesById.has(tileId)) throw new Error(`Tile ${tileId} is not part of this round`);
  }

  const verdicts: DragVerdict[] = round.facts.map((fact) => {
    const id = factId(fact);
    const placed = placements.get(id);
    const tile = placed === undefined ? undefined : tilesById.get(placed);
    return {
      factId: id,
      fact,
      correct: tile?.factId === id,
      placedValue: tile?.value ?? null,
    };
  });

  const score = verdicts.filter((verdict) => verdict.correct).length;

  return {
    verdicts,
    placements: new Map(placements),
    score,
    perfect: score === FACTS_PER_ROUND,
  };
}
