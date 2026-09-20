/**
 * Everything the progress and parent screens show, derived on read from the
 * round log and the fact records.
 *
 * Nothing here is stored. Two sources of truth would drift apart the first time
 * a write failed mid-round, and these are cheap to recompute from a few hundred
 * log entries.
 */

import { allFacts, parseFactId, type Op } from './facts';
import { stateOf, type FactRecord } from './scheduler';
import type { RoundLogEntry } from '../storage/store';

const OPS = ['mul', 'add', 'sub'] as const;

const TOTAL_FACTS = allFacts().length;

const FACTS_PER_OP: Record<Op, number> = {
  mul: allFacts().filter((fact) => fact.op === 'mul').length,
  add: allFacts().filter((fact) => fact.op === 'add').length,
  sub: allFacts().filter((fact) => fact.op === 'sub').length,
};

/** Log entries are untrusted: an id from an older build may not parse. */
function opOf(factId: string): Op | null {
  try {
    return parseFactId(factId).op;
  } catch {
    return null;
  }
}

const ratio = (correct: number, attempts: number): number =>
  attempts === 0 ? 0 : correct / attempts;

export interface KidProgress {
  readonly roundsToday: number;
  readonly perfectToday: number;
  readonly totalRounds: number;
  /** Perfect rounds in a row, right now. */
  readonly currentPerfectStreak: number;
  readonly bestPerfectStreak: number;
  readonly mastered: number;
  readonly learning: number;
  readonly totalFacts: number;
}

export function kidProgress(
  rounds: readonly RoundLogEntry[],
  records: ReadonlyMap<string, FactRecord>,
  today: string,
): KidProgress {
  const todays = rounds.filter((round) => round.day === today);

  let run = 0;
  let best = 0;
  for (const round of rounds) {
    run = round.perfect ? run + 1 : 0;
    if (run > best) best = run;
  }

  let mastered = 0;
  let learning = 0;
  for (const record of records.values()) {
    const state = stateOf(record);
    if (state === 'mastered') mastered++;
    else if (state === 'learning') learning++;
  }

  return {
    roundsToday: todays.length,
    perfectToday: todays.filter((round) => round.perfect).length,
    totalRounds: rounds.length,
    // `run` ends the loop holding the trailing streak.
    currentPerfectStreak: run,
    bestPerfectStreak: best,
    mastered,
    learning,
    totalFacts: TOTAL_FACTS,
  };
}

export interface OpBreakdown {
  readonly attempts: number;
  readonly correct: number;
  readonly accuracy: number;
  readonly mastered: number;
  readonly total: number;
}

export interface WeakFact {
  readonly factId: string;
  readonly attempts: number;
  readonly correct: number;
  readonly accuracy: number;
}

export interface DailyStat {
  readonly day: string;
  readonly rounds: number;
  readonly perfect: number;
  readonly attempts: number;
  readonly correct: number;
  readonly accuracy: number;
}

export interface ParentStats {
  readonly totalRounds: number;
  readonly totalAttempts: number;
  readonly totalCorrect: number;
  /** Accuracy per fact attempted, which is finer grained than per round. */
  readonly overallAccuracy: number;
  readonly byOp: Record<Op, OpBreakdown>;
  readonly weakest: readonly WeakFact[];
  readonly daily: readonly DailyStat[];
  readonly activeDays: number;
}

export interface ParentStatsOptions {
  readonly weakestLimit?: number;
}

export function parentStats(
  rounds: readonly RoundLogEntry[],
  records: ReadonlyMap<string, FactRecord>,
  options: ParentStatsOptions = {},
): ParentStats {
  const weakestLimit = options.weakestLimit ?? 10;

  const perFact = new Map<string, { attempts: number; correct: number }>();
  const perOp: Record<Op, { attempts: number; correct: number }> = {
    mul: { attempts: 0, correct: 0 },
    add: { attempts: 0, correct: 0 },
    sub: { attempts: 0, correct: 0 },
  };
  const perDay = new Map<string, { rounds: number; perfect: number; attempts: number; correct: number }>();

  let totalAttempts = 0;
  let totalCorrect = 0;

  for (const round of rounds) {
    const day = perDay.get(round.day) ?? { rounds: 0, perfect: 0, attempts: 0, correct: 0 };
    day.rounds++;
    if (round.perfect) day.perfect++;

    for (const verdict of round.verdicts) {
      totalAttempts++;
      day.attempts++;
      if (verdict.correct) {
        totalCorrect++;
        day.correct++;
      }

      const fact = perFact.get(verdict.factId) ?? { attempts: 0, correct: 0 };
      fact.attempts++;
      if (verdict.correct) fact.correct++;
      perFact.set(verdict.factId, fact);

      const op = opOf(verdict.factId);
      if (op) {
        perOp[op].attempts++;
        if (verdict.correct) perOp[op].correct++;
      }
    }

    perDay.set(round.day, day);
  }

  const masteredPerOp: Record<Op, number> = { mul: 0, add: 0, sub: 0 };
  for (const [id, record] of records) {
    if (stateOf(record) !== 'mastered') continue;
    const op = opOf(id);
    if (op) masteredPerOp[op]++;
  }

  const byOp = Object.fromEntries(
    OPS.map((op) => [
      op,
      {
        attempts: perOp[op].attempts,
        correct: perOp[op].correct,
        accuracy: ratio(perOp[op].correct, perOp[op].attempts),
        mastered: masteredPerOp[op],
        total: FACTS_PER_OP[op],
      },
    ]),
  ) as Record<Op, OpBreakdown>;

  const weakest = [...perFact.entries()]
    .map(([factId, tally]) => ({
      factId,
      attempts: tally.attempts,
      correct: tally.correct,
      accuracy: ratio(tally.correct, tally.attempts),
    }))
    // Least accurate first; ties go to the fact seen most often, then by id so
    // the list does not reshuffle between renders.
    .sort(
      (a, b) =>
        a.accuracy - b.accuracy ||
        b.attempts - a.attempts ||
        a.factId.localeCompare(b.factId),
    )
    .slice(0, weakestLimit);

  const daily = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, tally]) => ({
      day,
      rounds: tally.rounds,
      perfect: tally.perfect,
      attempts: tally.attempts,
      correct: tally.correct,
      accuracy: ratio(tally.correct, tally.attempts),
    }));

  return {
    totalRounds: rounds.length,
    totalAttempts,
    totalCorrect,
    overallAccuracy: ratio(totalCorrect, totalAttempts),
    byOp,
    weakest,
    daily,
    activeDays: daily.length,
  };
}
