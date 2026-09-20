import { describe, it, expect } from 'vitest';
import { applyOutcome, newRecord, type FactRecord } from './scheduler';
import type { RoundLogEntry } from '../storage/store';
import { kidProgress, parentStats } from './stats';

const round = (day: string, perfect: boolean, verdicts: [string, boolean][]): RoundLogEntry => ({
  at: `${day}T10:00:00.000Z`,
  day,
  seed: 1,
  factIds: verdicts.map(([id]) => id),
  verdicts: verdicts.map(([factId, correct]) => ({ factId, correct })),
  score: verdicts.filter(([, c]) => c).length,
  perfect,
  studyMs: 30000,
  recallMs: 15000,
});

const allRight = (day: string) =>
  round(day, true, [
    ['mul:7x8', true],
    ['add:4+9', true],
    ['sub:15-7', true],
    ['mul:6x3', true],
    ['add:2+3', true],
  ]);

const someWrong = (day: string) =>
  round(day, false, [
    ['mul:7x8', false],
    ['add:4+9', true],
    ['sub:15-7', false],
    ['mul:6x3', true],
    ['add:2+3', true],
  ]);

const masteredRecord = (id: string): FactRecord =>
  ['01', '02', '03'].reduce(
    (record, day) =>
      applyOutcome(record, true, { day: `2026-01-${day}`, at: `2026-01-${day}T10:00:00.000Z` }),
    newRecord(id),
  );

const learningRecord = (id: string): FactRecord =>
  applyOutcome(newRecord(id), false, { day: '2026-01-01', at: '2026-01-01T10:00:00.000Z' });

describe('kidProgress with no history', () => {
  const progress = kidProgress([], new Map(), '2026-01-05');

  it('reports zeros rather than NaN', () => {
    expect(progress.roundsToday).toBe(0);
    expect(progress.totalRounds).toBe(0);
    expect(progress.currentPerfectStreak).toBe(0);
    expect(progress.bestPerfectStreak).toBe(0);
    expect(progress.mastered).toBe(0);
  });

  it('still knows how many facts there are to learn', () => {
    expect(progress.totalFacts).toBe(243);
  });
});

describe('kidProgress counts', () => {
  const rounds = [allRight('2026-01-04'), someWrong('2026-01-05'), allRight('2026-01-05')];

  it('counts only rounds played today', () => {
    expect(kidProgress(rounds, new Map(), '2026-01-05').roundsToday).toBe(2);
  });

  it('counts perfect rounds played today', () => {
    expect(kidProgress(rounds, new Map(), '2026-01-05').perfectToday).toBe(1);
  });

  it('counts every round ever played', () => {
    expect(kidProgress(rounds, new Map(), '2026-01-05').totalRounds).toBe(3);
  });

  it('counts mastered and learning facts separately', () => {
    const records = new Map([
      ['mul:7x8', masteredRecord('mul:7x8')],
      ['add:4+9', masteredRecord('add:4+9')],
      ['sub:15-7', learningRecord('sub:15-7')],
    ]);
    const progress = kidProgress(rounds, records, '2026-01-05');
    expect(progress.mastered).toBe(2);
    expect(progress.learning).toBe(1);
  });
});

describe('kidProgress perfect-round streak', () => {
  it('counts consecutive perfect rounds up to the present', () => {
    const rounds = [someWrong('2026-01-01'), allRight('2026-01-02'), allRight('2026-01-03')];
    expect(kidProgress(rounds, new Map(), '2026-01-03').currentPerfectStreak).toBe(2);
  });

  it('is broken by an imperfect round', () => {
    const rounds = [allRight('2026-01-01'), allRight('2026-01-02'), someWrong('2026-01-03')];
    expect(kidProgress(rounds, new Map(), '2026-01-03').currentPerfectStreak).toBe(0);
  });

  it('remembers the best run even after it is broken', () => {
    const rounds = [
      allRight('2026-01-01'),
      allRight('2026-01-01'),
      allRight('2026-01-01'),
      someWrong('2026-01-02'),
      allRight('2026-01-02'),
    ];
    const progress = kidProgress(rounds, new Map(), '2026-01-02');
    expect(progress.bestPerfectStreak).toBe(3);
    expect(progress.currentPerfectStreak).toBe(1);
  });
});

describe('parentStats accuracy', () => {
  it('reports zero accuracy for an empty history without dividing by zero', () => {
    const stats = parentStats([], new Map());
    expect(stats.overallAccuracy).toBe(0);
    expect(Number.isNaN(stats.overallAccuracy)).toBe(false);
    expect(stats.totalRounds).toBe(0);
  });

  it('measures accuracy per fact attempted, not per round', () => {
    // Ten fact attempts, seven correct.
    const stats = parentStats([allRight('2026-01-01'), someWrong('2026-01-01')], new Map());
    expect(stats.totalAttempts).toBe(10);
    expect(stats.overallAccuracy).toBeCloseTo(0.8, 5);
  });

  it('breaks accuracy down by operation', () => {
    const stats = parentStats([someWrong('2026-01-01')], new Map());
    // mul: 7x8 wrong, 6x3 right. add: both right. sub: wrong.
    expect(stats.byOp.mul).toMatchObject({ attempts: 2, correct: 1 });
    expect(stats.byOp.add).toMatchObject({ attempts: 2, correct: 2 });
    expect(stats.byOp.sub).toMatchObject({ attempts: 1, correct: 0 });
    expect(stats.byOp.mul.accuracy).toBeCloseTo(0.5, 5);
  });

  it('counts mastered facts per operation', () => {
    const records = new Map([['mul:7x8', masteredRecord('mul:7x8')]]);
    const stats = parentStats([], records);
    expect(stats.byOp.mul.mastered).toBe(1);
    expect(stats.byOp.add.mastered).toBe(0);
    expect(stats.byOp.mul.total).toBe(81);
  });
});

describe('parentStats weakest facts', () => {
  const rounds = [
    someWrong('2026-01-01'),
    someWrong('2026-01-02'),
    someWrong('2026-01-03'),
    allRight('2026-01-04'),
  ];

  it('lists the least accurate first', () => {
    const weakest = parentStats(rounds, new Map()).weakest;
    expect(weakest[0]?.factId).toBe('mul:7x8');
    expect(weakest[0]?.accuracy).toBeCloseTo(0.25, 5);
  });

  it('only includes facts that have actually been attempted', () => {
    const weakest = parentStats(rounds, new Map()).weakest;
    expect(weakest.every((fact) => fact.attempts > 0)).toBe(true);
    expect(weakest.map((f) => f.factId)).not.toContain('mul:9x9');
  });

  it('respects the requested limit', () => {
    expect(parentStats(rounds, new Map(), { weakestLimit: 2 }).weakest).toHaveLength(2);
  });

  it('is empty when nothing has been played', () => {
    expect(parentStats([], new Map()).weakest).toEqual([]);
  });
});

describe('parentStats daily history', () => {
  const rounds = [
    allRight('2026-01-02'),
    someWrong('2026-01-01'),
    allRight('2026-01-01'),
  ];

  it('buckets rounds by day, oldest first', () => {
    const daily = parentStats(rounds, new Map()).daily;
    expect(daily.map((d) => d.day)).toEqual(['2026-01-01', '2026-01-02']);
    expect(daily[0]?.rounds).toBe(2);
    expect(daily[1]?.rounds).toBe(1);
  });

  it('reports accuracy for each day', () => {
    const daily = parentStats(rounds, new Map()).daily;
    expect(daily[0]?.accuracy).toBeCloseTo(0.8, 5);
    expect(daily[1]?.accuracy).toBeCloseTo(1, 5);
  });

  it('counts the days actually played', () => {
    expect(parentStats(rounds, new Map()).activeDays).toBe(2);
  });
});

describe('parentStats resilience', () => {
  it('ignores a log entry whose fact id is unparseable', () => {
    const broken = round('2026-01-01', false, [['not-a-fact-id', false]]);
    const stats = parentStats([broken], new Map());
    expect(stats.totalAttempts).toBe(1);
    expect(stats.byOp.mul.attempts).toBe(0);
    expect(stats.byOp.add.attempts).toBe(0);
    expect(stats.byOp.sub.attempts).toBe(0);
  });
});
