/**
 * A small seeded PRNG (mulberry32).
 *
 * Rounds are built through this rather than `Math.random`, so a round is
 * reproducible from its seed. That makes round generation testable and lets a
 * recorded round be replayed exactly.
 */

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** A new shuffled array. The input is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);

  return {
    next,
    int,

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty array');
      return items[int(items.length)] as T;
    },

    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const atI = out[i] as T;
        out[i] = out[j] as T;
        out[j] = atI;
      }
      return out;
    },
  };
}

/**
 * A shuffle guaranteed to differ from the order it was given.
 *
 * A plain shuffle of five items lands back on the original order about once in
 * every 120 rounds. That is rare enough to miss in testing and common enough
 * that a child would eventually meet a recall phase laid out exactly like the
 * study phase, where position alone would give the answers away.
 *
 * Fewer than two items have no other order, so they come back unchanged.
 */
export function reorder<T>(items: readonly T[], rng: Rng): T[] {
  if (items.length < 2) return [...items];

  const shuffled = rng.shuffle(items);
  if (shuffled.some((item, index) => item !== items[index])) return shuffled;

  // Landed on the original order. Rotating by one is a different arrangement
  // for any length above one, and needs no second draw.
  return [...shuffled.slice(1), shuffled[0] as T];
}

/** A seed for real gameplay, where reproducibility is not wanted. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
