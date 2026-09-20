import { describe, it, expect } from 'vitest';
import { createRng } from '../lib/rng';
import { allFacts, answerOf, answerRange, type Fact } from './facts';
import { fakeAnswers } from './distractors';

const seeds = Array.from({ length: 25 }, (_, i) => i + 1);

describe('fakeAnswers', () => {
  it('returns the requested number of fakes', () => {
    expect(fakeAnswers({ op: 'mul', left: 7, right: 8 }, 2, createRng(1))).toHaveLength(2);
  });

  it('is deterministic for a given seed', () => {
    const fact: Fact = { op: 'mul', left: 7, right: 8 };
    expect(fakeAnswers(fact, 2, createRng(4))).toEqual(fakeAnswers(fact, 2, createRng(4)));
  });

  it('does not always produce the same pair, so fakes cannot be memorised', () => {
    const fact: Fact = { op: 'mul', left: 7, right: 8 };
    const pairs = new Set(seeds.map((s) => fakeAnswers(fact, 2, createRng(s)).join(',')));
    expect(pairs.size).toBeGreaterThan(1);
  });
});

describe('fakeAnswers invariants, across every fact and many seeds', () => {
  it('never returns the true answer', () => {
    for (const fact of allFacts()) {
      const truth = answerOf(fact);
      for (const seed of seeds) {
        expect(fakeAnswers(fact, 2, createRng(seed))).not.toContain(truth);
      }
    }
  });

  it('never repeats a fake within one fact', () => {
    for (const fact of allFacts()) {
      for (const seed of seeds) {
        const fakes = fakeAnswers(fact, 2, createRng(seed));
        expect(new Set(fakes).size).toBe(fakes.length);
      }
    }
  });

  it('keeps every fake inside the operation answer range', () => {
    for (const fact of allFacts()) {
      const { min, max } = answerRange(fact.op);
      for (const seed of seeds) {
        for (const fake of fakeAnswers(fact, 2, createRng(seed))) {
          expect(fake).toBeGreaterThanOrEqual(min);
          expect(fake).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('never offers a two-digit fake for a subtraction, which would be dismissible on sight', () => {
    for (const fact of allFacts().filter((f) => f.op === 'sub')) {
      for (const seed of seeds) {
        for (const fake of fakeAnswers(fact, 2, createRng(seed))) {
          expect(fake).toBeLessThanOrEqual(9);
          expect(fake).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('returns whole positive numbers only', () => {
    for (const fact of allFacts()) {
      for (const fake of fakeAnswers(fact, 2, createRng(99))) {
        expect(Number.isInteger(fake)).toBe(true);
        expect(fake).toBeGreaterThan(0);
      }
    }
  });
});

describe('plausibility', () => {
  it('draws multiplication fakes from adjacent multiples, the classic table slip', () => {
    // 7 x 8 = 56; adjacent multiples are 56 +/- 7 and 56 +/- 8.
    const adjacent = new Set([63, 49, 64, 48]);
    for (const seed of seeds) {
      for (const fake of fakeAnswers({ op: 'mul', left: 7, right: 8 }, 2, createRng(seed))) {
        expect(adjacent).toContain(fake);
      }
    }
  });

  it('offers the borrow error for a two-digit subtraction', () => {
    // 15 - 7 = 8; the classic slip is |5 - 7| = 2.
    const produced = new Set(
      seeds.flatMap((s) => fakeAnswers({ op: 'sub', left: 15, right: 7 }, 2, createRng(s))),
    );
    expect(produced).toContain(2);
  });

  it('stays near the true answer for addition', () => {
    for (const seed of seeds) {
      for (const fake of fakeAnswers({ op: 'add', left: 4, right: 9 }, 2, createRng(seed))) {
        expect(Math.abs(fake - 13)).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('fakeAnswers when plausible candidates run out', () => {
  it('still fills the request from the valid range', () => {
    // 2 - 1 = 1 sits at the bottom of the subtraction range, so most
    // near-miss candidates fall outside 1-9 and are rejected.
    const fakes = fakeAnswers({ op: 'sub', left: 2, right: 1 }, 5, createRng(2));
    expect(fakes).toHaveLength(5);
    expect(new Set(fakes).size).toBe(5);
    expect(fakes).not.toContain(1);
    for (const fake of fakes) {
      expect(fake).toBeGreaterThanOrEqual(1);
      expect(fake).toBeLessThanOrEqual(9);
    }
  });

  it('throws rather than returning short when the range cannot supply enough', () => {
    // Subtraction has 9 possible answers, so at most 8 distinct fakes exist.
    expect(() => fakeAnswers({ op: 'sub', left: 15, right: 7 }, 9, createRng(1))).toThrow();
  });
});
