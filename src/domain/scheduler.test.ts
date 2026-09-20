import { describe, it, expect } from 'vitest';
import { createRng } from '../lib/rng';
import { allFacts, answerOf, factId, type Fact } from './facts';
import {
  MASTERY_STREAK,
  applyOutcome,
  localDay,
  newRecord,
  selectFacts,
  stateOf,
  weightOf,
  type FactRecord,
} from './scheduler';

const ID = 'mul:7x8';
const correctOn = (record: FactRecord, day: string) =>
  applyOutcome(record, true, { day, at: `${day}T10:00:00.000Z` });
const wrongOn = (record: FactRecord, day: string) =>
  applyOutcome(record, false, { day, at: `${day}T10:00:00.000Z` });

describe('newRecord', () => {
  it('starts unseen, with no streak and no credited day', () => {
    const record = newRecord(ID);
    expect(record).toMatchObject({ factId: ID, attempts: 0, correct: 0, streak: 0 });
    expect(record.lastCreditedDay).toBeNull();
    expect(stateOf(record)).toBe('new');
  });
});

describe('mastery: three correct answers on three different days', () => {
  it('credits the first correct answer of a day', () => {
    const record = correctOn(newRecord(ID), '2026-01-01');
    expect(record.streak).toBe(1);
    expect(record.lastCreditedDay).toBe('2026-01-01');
    expect(stateOf(record)).toBe('learning');
  });

  it('does not advance the streak for a second correct answer the same day', () => {
    let record = correctOn(newRecord(ID), '2026-01-01');
    record = correctOn(record, '2026-01-01');
    record = correctOn(record, '2026-01-01');
    expect(record.streak).toBe(1);
    expect(stateOf(record)).toBe('learning');
  });

  it('still counts same-day repeats as attempts', () => {
    let record = correctOn(newRecord(ID), '2026-01-01');
    record = correctOn(record, '2026-01-01');
    expect(record.attempts).toBe(2);
    expect(record.correct).toBe(2);
  });

  it('reaches mastery on the third distinct day', () => {
    let record = correctOn(newRecord(ID), '2026-01-01');
    expect(stateOf(record)).toBe('learning');
    record = correctOn(record, '2026-01-02');
    expect(record.streak).toBe(2);
    expect(stateOf(record)).toBe('learning');
    record = correctOn(record, '2026-01-03');
    expect(record.streak).toBe(MASTERY_STREAK);
    expect(stateOf(record)).toBe('mastered');
  });

  it('cannot be mastered within a single day, however many times it is answered', () => {
    let record = newRecord(ID);
    for (let i = 0; i < 20; i++) record = correctOn(record, '2026-01-01');
    expect(stateOf(record)).toBe('learning');
    expect(record.streak).toBe(1);
  });

  it('does not keep growing the streak past mastery', () => {
    let record = newRecord(ID);
    for (const day of ['01', '02', '03', '04', '05']) record = correctOn(record, `2026-01-${day}`);
    expect(record.streak).toBe(MASTERY_STREAK);
  });
});

describe('mastery: a wrong answer resets', () => {
  it('clears the streak and the credited day', () => {
    let record = correctOn(newRecord(ID), '2026-01-01');
    record = wrongOn(record, '2026-01-02');
    expect(record.streak).toBe(0);
    expect(record.lastCreditedDay).toBeNull();
    expect(stateOf(record)).toBe('learning');
  });

  it('resets even on a day that was already credited', () => {
    let record = correctOn(newRecord(ID), '2026-01-01');
    record = wrongOn(record, '2026-01-01');
    expect(record.streak).toBe(0);
  });

  it('demotes a mastered fact back to learning', () => {
    let record = newRecord(ID);
    for (const day of ['01', '02', '03']) record = correctOn(record, `2026-01-${day}`);
    expect(stateOf(record)).toBe('mastered');
    record = wrongOn(record, '2026-01-04');
    expect(stateOf(record)).toBe('learning');
    expect(record.streak).toBe(0);
  });

  it('lets a fact re-credit the same day it was missed', () => {
    let record = wrongOn(newRecord(ID), '2026-01-01');
    record = correctOn(record, '2026-01-01');
    expect(record.streak).toBe(1);
  });

  it('counts a wrong answer as an attempt but not a success', () => {
    const record = wrongOn(newRecord(ID), '2026-01-01');
    expect(record.attempts).toBe(1);
    expect(record.correct).toBe(0);
  });
});

describe('applyOutcome', () => {
  it('records when the fact was last seen', () => {
    const record = correctOn(newRecord(ID), '2026-01-01');
    expect(record.lastSeenAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('does not mutate the record it is given', () => {
    const before = newRecord(ID);
    correctOn(before, '2026-01-01');
    expect(before.attempts).toBe(0);
    expect(before.streak).toBe(0);
  });

  it('keeps only the most recent five outcomes', () => {
    let record = newRecord(ID);
    for (let i = 0; i < 8; i++) record = wrongOn(record, `2026-01-0${(i % 9) + 1}`);
    expect(record.recent).toHaveLength(5);
  });
});

describe('localDay', () => {
  it('formats a date in local time, not UTC', () => {
    expect(localDay(new Date(2026, 8, 20, 23, 30))).toBe('2026-09-20');
    expect(localDay(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });
});

describe('weightOf', () => {
  const learning = correctOn(newRecord(ID), '2026-01-01');
  const mastered = ['01', '02', '03'].reduce((r, d) => correctOn(r, `2026-01-${d}`), newRecord(ID));

  it('ranks learning above new, and new above mastered', () => {
    expect(weightOf(learning, false)).toBeGreaterThan(weightOf(undefined, false));
    expect(weightOf(undefined, false)).toBeGreaterThan(weightOf(mastered, false));
  });

  it('gives a mastered fact the smallest non-zero weight', () => {
    expect(weightOf(mastered, false)).toBe(1);
  });

  it('raises the weight of a fact that has been missed recently', () => {
    const missedOnce = wrongOn(learning, '2026-01-02');
    const missedTwice = wrongOn(missedOnce, '2026-01-03');
    expect(weightOf(missedOnce, false)).toBeGreaterThan(weightOf(learning, false));
    expect(weightOf(missedTwice, false)).toBeGreaterThan(weightOf(missedOnce, false));
  });

  it('halves the weight of a fact seen in the last few rounds', () => {
    expect(weightOf(learning, true)).toBe(weightOf(learning, false) / 2);
  });

  it('never drops to zero, so any fact can still come up', () => {
    expect(weightOf(mastered, true)).toBeGreaterThan(0);
  });
});

describe('selectFacts', () => {
  const draw = (overrides: Partial<Parameters<typeof selectFacts>[0]> = {}) =>
    selectFacts({
      records: new Map(),
      recentFactIds: [],
      count: 5,
      rng: createRng(1),
      ...overrides,
    });

  it('returns the requested number of facts', () => {
    expect(draw()).toHaveLength(5);
  });

  it('never repeats a fact within a round', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const ids = draw({ rng: createRng(seed) }).map(factId);
      expect(new Set(ids).size).toBe(5);
    }
  });

  it('gives every fact in a round a distinct answer', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const answers = draw({ rng: createRng(seed) }).map(answerOf);
      expect(new Set(answers).size).toBe(5);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(draw({ rng: createRng(8) })).toEqual(draw({ rng: createRng(8) }));
  });

  it('draws from the whole universe over many rounds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const fact of draw({ rng: createRng(seed) })) seen.add(factId(fact));
    }
    expect(seen.size).toBeGreaterThan(100);
  });

  it('picks a struggling fact far more often than a mastered one', () => {
    const pool: Fact[] = [
      { op: 'mul', left: 2, right: 2 },
      { op: 'mul', left: 3, right: 3 },
      { op: 'mul', left: 4, right: 4 },
      { op: 'mul', left: 5, right: 5 },
    ];
    const struggling = wrongOn(newRecord(factId(pool[0]!)), '2026-01-01');
    const records = new Map<string, FactRecord>([[factId(pool[0]!), struggling]]);
    for (const fact of pool.slice(1)) {
      const id = factId(fact);
      records.set(
        id,
        ['01', '02', '03'].reduce((r, d) => correctOn(r, `2026-01-${d}`), newRecord(id)),
      );
    }

    let strugglingPicked = 0;
    const trials = 300;
    for (let seed = 1; seed <= trials; seed++) {
      const picked = selectFacts({ records, recentFactIds: [], count: 1, rng: createRng(seed), pool });
      if (factId(picked[0]!) === factId(pool[0]!)) strugglingPicked++;
    }
    expect(strugglingPicked / trials).toBeGreaterThan(0.6);
  });

  it('leans away from facts asked in the last few rounds', () => {
    const pool: Fact[] = [
      { op: 'mul', left: 2, right: 2 },
      { op: 'mul', left: 3, right: 3 },
    ];
    const justAsked = factId(pool[0]!);

    let justAskedPicked = 0;
    const trials = 300;
    for (let seed = 1; seed <= trials; seed++) {
      const picked = selectFacts({
        records: new Map(),
        recentFactIds: [justAsked],
        count: 1,
        rng: createRng(seed),
        pool,
      });
      if (factId(picked[0]!) === justAsked) justAskedPicked++;
    }
    expect(justAskedPicked / trials).toBeLessThan(0.45);
    expect(justAskedPicked / trials).toBeGreaterThan(0.2);
  });

  it('throws when the pool cannot supply enough distinct answers', () => {
    // 4 + 9 and 8 + 5 both answer 13, so this pool offers only one usable answer.
    const pool: Fact[] = [
      { op: 'add', left: 4, right: 9 },
      { op: 'add', left: 8, right: 5 },
    ];
    expect(() =>
      selectFacts({ records: new Map(), recentFactIds: [], count: 2, rng: createRng(1), pool }),
    ).toThrow();
  });

  it('works against the real 243-fact universe', () => {
    const facts = draw({ pool: allFacts() });
    expect(facts).toHaveLength(5);
  });
});
