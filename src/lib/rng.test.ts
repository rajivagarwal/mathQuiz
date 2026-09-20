import { describe, it, expect } from 'vitest';
import { createRng, reorder } from './rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const draw = (r: ReturnType<typeof createRng>) => [r.next(), r.next(), r.next()];
    expect(draw(a)).toEqual(draw(b));
  });

  it('produces different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('rng.int', () => {
  it('returns integers in [0, maxExclusive)', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
    }
  });

  it('eventually reaches every value in range', () => {
    const rng = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(5));
    expect(seen.size).toBe(5);
  });
});

describe('rng.shuffle', () => {
  it('keeps every element exactly once', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = createRng(11).shuffle(input);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5];
    createRng(11).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('actually reorders', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    expect(createRng(11).shuffle(input)).not.toEqual(input);
  });

  it('is deterministic for a given seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(createRng(5).shuffle(input)).toEqual(createRng(5).shuffle(input));
  });
});

describe('rng.pick', () => {
  it('returns an element of the array', () => {
    const items = ['a', 'b', 'c'];
    const rng = createRng(13);
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
  });

  it('throws on an empty array rather than returning undefined', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});

describe('reorder', () => {
  const input = [1, 2, 3, 4, 5];

  it('keeps every element exactly once', () => {
    const out = reorder(input, createRng(7));
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('never returns the original order, however the shuffle lands', () => {
    for (let seed = 1; seed <= 500; seed++) {
      expect(reorder(input, createRng(seed))).not.toEqual(input);
    }
  });

  it('does not mutate its input', () => {
    reorder(input, createRng(3));
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a given seed', () => {
    expect(reorder(input, createRng(9))).toEqual(reorder(input, createRng(9)));
  });

  it('returns a lone element unchanged, since no other order exists', () => {
    expect(reorder(['only'], createRng(1))).toEqual(['only']);
    expect(reorder([], createRng(1))).toEqual([]);
  });
});
