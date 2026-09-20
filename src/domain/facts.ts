/**
 * The universe of arithmetic facts the app drills.
 *
 * A Fact is a left-hand side only: `7 × 8`. Its answer is derived, never stored,
 * so a fact can never disagree with itself.
 */

export type Op = 'mul' | 'add' | 'sub';

export interface Fact {
  readonly op: Op;
  readonly left: number;
  readonly right: number;
}

/** The character used inside a fact id. Not the display glyph — see `OP_GLYPH`. */
const ID_SYMBOL: Record<Op, string> = { mul: 'x', add: '+', sub: '-' };

export function answerOf(fact: Fact): number {
  switch (fact.op) {
    case 'mul':
      return fact.left * fact.right;
    case 'add':
      return fact.left + fact.right;
    case 'sub':
      return fact.left - fact.right;
  }
}

export function factId(fact: Fact): string {
  return `${fact.op}:${fact.left}${ID_SYMBOL[fact.op]}${fact.right}`;
}

const ID_PATTERN = /^(mul|add|sub):(\d+)([x+-])(\d+)$/;

export function parseFactId(id: string): Fact {
  const match = ID_PATTERN.exec(id);
  if (!match) throw new Error(`Malformed fact id: ${id}`);

  const [, op, left, symbol, right] = match;
  if (op === undefined || left === undefined || symbol === undefined || right === undefined) {
    throw new Error(`Malformed fact id: ${id}`);
  }
  if (ID_SYMBOL[op as Op] !== symbol) {
    throw new Error(`Fact id operator does not match its operation: ${id}`);
  }

  return { op: op as Op, left: Number(left), right: Number(right) };
}

/** Display glyphs: a true multiplication sign and minus sign, not `*` and `-`. */
export const OP_GLYPH: Record<Op, string> = { mul: '×', add: '+', sub: '−' };

export function lhsText(fact: Fact): string {
  return `${fact.left} ${OP_GLYPH[fact.op]} ${fact.right}`;
}

/** Renders `fact` against an arbitrary right-hand side — true or false. */
export function equationText(fact: Fact, rhs: number): string {
  return `${lhsText(fact)} = ${rhs}`;
}

export interface AnswerRange {
  readonly min: number;
  readonly max: number;
}

/**
 * The full span of answers an operation can produce. Fake answers must stay
 * inside it, or arithmetic range alone would give them away.
 */
const ANSWER_RANGE: Record<Op, AnswerRange> = {
  mul: { min: 1, max: 81 },
  add: { min: 2, max: 18 },
  sub: { min: 1, max: 9 },
};

export function answerRange(op: Op): AnswerRange {
  return ANSWER_RANGE[op];
}

const OPERAND_MIN = 1;
const OPERAND_MAX = 9;

export function allFacts(): Fact[] {
  const facts: Fact[] = [];

  for (let left = OPERAND_MIN; left <= OPERAND_MAX; left++) {
    for (let right = OPERAND_MIN; right <= OPERAND_MAX; right++) {
      facts.push({ op: 'mul', left, right });
      facts.push({ op: 'add', left, right });
    }
  }

  // Subtraction is generated from (subtrahend, answer) rather than filtered from
  // (minuend, subtrahend). That makes "the answer is always a single digit, and
  // the minuend is at most two digits" true by construction: left = right + answer
  // maxes out at 9 + 9 = 18.
  for (let right = OPERAND_MIN; right <= OPERAND_MAX; right++) {
    for (let answer = OPERAND_MIN; answer <= OPERAND_MAX; answer++) {
      facts.push({ op: 'sub', left: right + answer, right });
    }
  }

  return facts;
}
