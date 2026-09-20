/**
 * Which facts to ask next, and when a fact counts as learned.
 *
 * Mastery is deliberately slow: three correct answers on three *different*
 * days. A fact can only earn one credit per day, so it cannot be ground to
 * mastery in one sitting -- which is exactly what a child will try to do.
 */

import type { Rng } from '../lib/rng';
import { allFacts, answerOf, factId, type Fact } from './facts';

export const MASTERY_STREAK = 3;

/** How many past outcomes a record keeps, for the "recently missed" boost. */
const RECENT_WINDOW = 5;

export type FactState = 'new' | 'learning' | 'mastered';

export interface FactRecord {
  readonly factId: string;
  readonly attempts: number;
  readonly correct: number;
  /** Consecutive day-credits. Reaching MASTERY_STREAK means mastered. */
  readonly streak: number;
  /** The last day that advanced the streak, as YYYY-MM-DD local. */
  readonly lastCreditedDay: string | null;
  readonly lastSeenAt: string | null;
  /** Most recent outcomes, oldest first, capped at RECENT_WINDOW. */
  readonly recent: readonly boolean[];
}

export function newRecord(id: string): FactRecord {
  return {
    factId: id,
    attempts: 0,
    correct: 0,
    streak: 0,
    lastCreditedDay: null,
    lastSeenAt: null,
    recent: [],
  };
}

export function stateOf(record: FactRecord | undefined): FactState {
  if (!record || record.attempts === 0) return 'new';
  return record.streak >= MASTERY_STREAK ? 'mastered' : 'learning';
}

/** The local calendar day, which is what "different days" means to a child. */
export function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface OutcomeContext {
  /** Local calendar day, YYYY-MM-DD. */
  readonly day: string;
  /** ISO timestamp of the attempt. */
  readonly at: string;
}

export function applyOutcome(
  record: FactRecord,
  correct: boolean,
  context: OutcomeContext,
): FactRecord {
  const base: FactRecord = {
    ...record,
    attempts: record.attempts + 1,
    correct: record.correct + (correct ? 1 : 0),
    lastSeenAt: context.at,
    recent: [...record.recent, correct].slice(-RECENT_WINDOW),
  };

  // A miss is a miss, even on a day already credited.
  if (!correct) {
    return { ...base, streak: 0, lastCreditedDay: null };
  }

  // One credit per day. Repeats still count as attempts, but buy no progress.
  if (record.lastCreditedDay === context.day) {
    return base;
  }

  return {
    ...base,
    streak: Math.min(record.streak + 1, MASTERY_STREAK),
    lastCreditedDay: context.day,
  };
}

const WEIGHT_NEW = 4;
const WEIGHT_MASTERED = 1;
const WEIGHT_LEARNING = 8;
const MISS_BOOST = 4;
const MAX_MISS_BOOST = 3;

/**
 * How strongly a fact should compete to be asked. Struggling facts come back
 * hard, new material is introduced steadily, mastered facts only trickle.
 */
export function weightOf(record: FactRecord | undefined, recentlySeen: boolean): number {
  const state = stateOf(record);

  let weight = WEIGHT_NEW;
  if (state === 'mastered') {
    weight = WEIGHT_MASTERED;
  } else if (state === 'learning' && record) {
    const misses = Math.min(record.recent.filter((ok) => !ok).length, MAX_MISS_BOOST);
    weight = WEIGHT_LEARNING + MISS_BOOST * misses;
  }

  // Halved, never zeroed: a fact asked last round should be unlikely, not barred.
  return recentlySeen ? weight / 2 : weight;
}

export interface SelectionParams {
  readonly records: ReadonlyMap<string, FactRecord>;
  /** Facts asked in the last few rounds, which get a reduced weight. */
  readonly recentFactIds: readonly string[];
  readonly count: number;
  readonly rng: Rng;
  /** Defaults to the full 243-fact universe. */
  readonly pool?: readonly Fact[];
}

interface Candidate {
  readonly fact: Fact;
  readonly answer: number;
  readonly weight: number;
}

function weightedPick(candidates: readonly Candidate[], rng: Rng): Candidate {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = rng.next() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll < 0) return candidate;
  }
  return candidates[candidates.length - 1] as Candidate;
}

/**
 * Draws `count` facts, each with a distinct answer.
 *
 * Distinct answers matter because the result screen shows all the equations at
 * once: two facts sharing an answer make it ambiguous which card the child was
 * meant to remember.
 */
export function selectFacts(params: SelectionParams): Fact[] {
  const { records, recentFactIds, count, rng } = params;
  const pool = params.pool ?? allFacts();
  const recentlySeen = new Set(recentFactIds);

  let candidates: Candidate[] = pool.map((fact) => {
    const id = factId(fact);
    return { fact, answer: answerOf(fact), weight: weightOf(records.get(id), recentlySeen.has(id)) };
  });

  const chosen: Fact[] = [];
  const usedAnswers = new Set<number>();

  while (chosen.length < count) {
    candidates = candidates.filter((candidate) => !usedAnswers.has(candidate.answer));
    if (candidates.length === 0) {
      throw new Error(
        `Fact pool cannot supply ${count} facts with distinct answers (got ${chosen.length})`,
      );
    }
    const picked = weightedPick(candidates, rng);
    chosen.push(picked.fact);
    usedAnswers.add(picked.answer);
  }

  return chosen;
}
