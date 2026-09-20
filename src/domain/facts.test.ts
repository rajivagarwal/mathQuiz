import { describe, it, expect } from 'vitest';
import {
  allFacts,
  answerOf,
  answerRange,
  equationText,
  factId,
  lhsText,
  parseFactId,
  type Fact,
} from './facts';

describe('answerOf', () => {
  it('multiplies the operands', () => {
    expect(answerOf({ op: 'mul', left: 7, right: 8 })).toBe(56);
  });

  it('adds the operands', () => {
    expect(answerOf({ op: 'add', left: 4, right: 9 })).toBe(13);
  });

  it('subtracts the right operand from the left', () => {
    expect(answerOf({ op: 'sub', left: 15, right: 7 })).toBe(8);
  });
});

describe('factId', () => {
  it('renders a stable key per operation', () => {
    expect(factId({ op: 'mul', left: 7, right: 8 })).toBe('mul:7x8');
    expect(factId({ op: 'add', left: 4, right: 9 })).toBe('add:4+9');
    expect(factId({ op: 'sub', left: 15, right: 7 })).toBe('sub:15-7');
  });

  it('distinguishes the two orderings of a commutative pair', () => {
    expect(factId({ op: 'mul', left: 7, right: 8 })).not.toBe(
      factId({ op: 'mul', left: 8, right: 7 }),
    );
  });
});

describe('parseFactId', () => {
  it('round-trips every operation', () => {
    const facts: Fact[] = [
      { op: 'mul', left: 7, right: 8 },
      { op: 'add', left: 4, right: 9 },
      { op: 'sub', left: 15, right: 7 },
    ];
    for (const fact of facts) {
      expect(parseFactId(factId(fact))).toEqual(fact);
    }
  });

  it('rejects a malformed id', () => {
    expect(() => parseFactId('nope:1?2')).toThrow();
  });
});

describe('allFacts', () => {
  const facts = allFacts();
  const byOp = (op: Fact['op']) => facts.filter((f) => f.op === op);

  it('contains 81 facts per operation, 243 in total', () => {
    expect(byOp('mul')).toHaveLength(81);
    expect(byOp('add')).toHaveLength(81);
    expect(byOp('sub')).toHaveLength(81);
    expect(facts).toHaveLength(243);
  });

  it('gives every fact a unique id', () => {
    const ids = new Set(facts.map(factId));
    expect(ids.size).toBe(facts.length);
  });

  it('uses only operands 1-9 for multiplication and addition', () => {
    for (const fact of [...byOp('mul'), ...byOp('add')]) {
      expect(fact.left).toBeGreaterThanOrEqual(1);
      expect(fact.left).toBeLessThanOrEqual(9);
      expect(fact.right).toBeGreaterThanOrEqual(1);
      expect(fact.right).toBeLessThanOrEqual(9);
    }
  });

  it('keeps every subtraction answer to a single digit', () => {
    for (const fact of byOp('sub')) {
      const answer = answerOf(fact);
      expect(answer).toBeGreaterThanOrEqual(1);
      expect(answer).toBeLessThanOrEqual(9);
    }
  });

  it('keeps every subtraction minuend to at most two digits, subtrahend to one', () => {
    for (const fact of byOp('sub')) {
      expect(fact.left).toBeGreaterThanOrEqual(2);
      expect(fact.left).toBeLessThanOrEqual(18);
      expect(fact.right).toBeGreaterThanOrEqual(1);
      expect(fact.right).toBeLessThanOrEqual(9);
    }
  });

  it('includes the two-digit subtractions that make the game worth playing', () => {
    const ids = new Set(facts.map(factId));
    expect(ids.has('sub:15-7')).toBe(true);
    expect(ids.has('sub:18-9')).toBe(true);
  });

  it('never uses zero as an operand or a subtraction answer', () => {
    for (const fact of facts) {
      expect(fact.left).not.toBe(0);
      expect(fact.right).not.toBe(0);
      expect(answerOf(fact)).not.toBe(0);
    }
  });
});

describe('answerRange', () => {
  it('spans exactly the answers each operation can produce', () => {
    expect(answerRange('mul')).toEqual({ min: 1, max: 81 });
    expect(answerRange('add')).toEqual({ min: 2, max: 18 });
    expect(answerRange('sub')).toEqual({ min: 1, max: 9 });
  });

  it('contains the answer of every fact in the universe', () => {
    for (const fact of allFacts()) {
      const { min, max } = answerRange(fact.op);
      expect(answerOf(fact)).toBeGreaterThanOrEqual(min);
      expect(answerOf(fact)).toBeLessThanOrEqual(max);
    }
  });
});

describe('display text', () => {
  it('renders the left-hand side with typographic operators', () => {
    expect(lhsText({ op: 'mul', left: 7, right: 8 })).toBe('7 × 8');
    expect(lhsText({ op: 'add', left: 4, right: 9 })).toBe('4 + 9');
    expect(lhsText({ op: 'sub', left: 15, right: 7 })).toBe('15 − 7');
  });

  it('renders a full equation against any right-hand side', () => {
    const fact: Fact = { op: 'mul', left: 7, right: 8 };
    expect(equationText(fact, 56)).toBe('7 × 8 = 56');
    expect(equationText(fact, 54)).toBe('7 × 8 = 54');
  });
});
