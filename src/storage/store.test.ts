import { describe, it, expect } from 'vitest';
import { applyOutcome, newRecord } from '../domain/scheduler';
import {
  DEFAULT_SETTINGS,
  KEY_PREFIX,
  MAX_ROUNDS,
  createMemoryStorage,
  createStore,
  type RoundLogEntry,
  type StorageLike,
} from './store';

const entry = (n: number): RoundLogEntry => ({
  at: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}.000Z`,
  day: '2026-01-01',
  seed: n,
  factIds: ['mul:7x8'],
  verdicts: [{ factId: 'mul:7x8', correct: n % 2 === 0 }],
  score: n % 6,
  perfect: n % 6 === 5,
  studyMs: 30000,
  recallMs: 15000,
});

/** A storage whose writes fail, as they do when the quota is exhausted. */
function readOnlyStorage(): StorageLike {
  const inner = createMemoryStorage();
  return {
    get length() {
      return inner.length;
    },
    key: (i) => inner.key(i),
    getItem: (k) => inner.getItem(k),
    removeItem: (k) => inner.removeItem(k),
    setItem: () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    },
  };
}

describe('settings', () => {
  it('returns the defaults before anything is saved', () => {
    expect(createStore(createMemoryStorage()).getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through storage', () => {
    const storage = createMemoryStorage();
    createStore(storage).saveSettings({ studySeconds: 45, recallSeconds: 20 });
    expect(createStore(storage).getSettings()).toEqual({ studySeconds: 45, recallSeconds: 20 });
  });

  it('falls back to defaults when the stored value is corrupt', () => {
    const storage = createMemoryStorage();
    storage.setItem(`${KEY_PREFIX}settings`, 'not json at all');
    expect(createStore(storage).getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('fills in a missing field rather than returning a half-built object', () => {
    const storage = createMemoryStorage();
    storage.setItem(`${KEY_PREFIX}settings`, JSON.stringify({ studySeconds: 45 }));
    expect(createStore(storage).getSettings()).toEqual({
      studySeconds: 45,
      recallSeconds: DEFAULT_SETTINGS.recallSeconds,
    });
  });
});

describe('fact records', () => {
  it('starts empty', () => {
    expect(createStore(createMemoryStorage()).getFactRecords().size).toBe(0);
  });

  it('round-trips a record', () => {
    const storage = createMemoryStorage();
    const record = applyOutcome(newRecord('mul:7x8'), true, {
      day: '2026-01-01',
      at: '2026-01-01T10:00:00.000Z',
    });
    createStore(storage).saveFactRecords([record]);
    expect(createStore(storage).getFactRecords().get('mul:7x8')).toEqual(record);
  });

  it('merges new records with existing ones', () => {
    const storage = createMemoryStorage();
    const store = createStore(storage);
    store.saveFactRecords([newRecord('mul:7x8')]);
    store.saveFactRecords([newRecord('add:4+9')]);
    expect([...createStore(storage).getFactRecords().keys()].sort()).toEqual([
      'add:4+9',
      'mul:7x8',
    ]);
  });

  it('ignores a corrupt blob rather than throwing', () => {
    const storage = createMemoryStorage();
    storage.setItem(`${KEY_PREFIX}facts`, '{{{');
    expect(createStore(storage).getFactRecords().size).toBe(0);
  });
});

describe('round log', () => {
  it('appends in order', () => {
    const store = createStore(createMemoryStorage());
    store.appendRound(entry(1));
    store.appendRound(entry(2));
    expect(store.getRounds().map((r) => r.seed)).toEqual([1, 2]);
  });

  it('keeps only the most recent rounds once the cap is reached', () => {
    const store = createStore(createMemoryStorage());
    for (let i = 1; i <= MAX_ROUNDS + 25; i++) store.appendRound(entry(i));
    const rounds = store.getRounds();
    expect(rounds).toHaveLength(MAX_ROUNDS);
    expect(rounds[0]?.seed).toBe(26);
    expect(rounds[rounds.length - 1]?.seed).toBe(MAX_ROUNDS + 25);
  });

  it('survives a reload', () => {
    const storage = createMemoryStorage();
    createStore(storage).appendRound(entry(7));
    expect(createStore(storage).getRounds()[0]?.seed).toBe(7);
  });
});

describe('parent lock', () => {
  it('is absent until enrolled', () => {
    expect(createStore(createMemoryStorage()).getParentLock()).toBeNull();
  });

  it('round-trips an enrolment', () => {
    const storage = createMemoryStorage();
    const lock = {
      kind: 'webauthn' as const,
      credentialId: 'abc123',
      enrolledAt: '2026-01-01T00:00:00.000Z',
    };
    createStore(storage).saveParentLock(lock);
    expect(createStore(storage).getParentLock()).toEqual(lock);
  });
});

describe('clearAll', () => {
  it('removes every trace of the app', () => {
    const storage = createMemoryStorage();
    const store = createStore(storage);
    store.saveSettings({ studySeconds: 45, recallSeconds: 20 });
    store.appendRound(entry(1));
    store.saveFactRecords([newRecord('mul:7x8')]);
    store.saveParentLock({ kind: 'pin', pinHash: 'x', enrolledAt: '2026-01-01T00:00:00.000Z' });

    store.clearAll();

    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(store.getRounds()).toEqual([]);
    expect(store.getFactRecords().size).toBe(0);
    expect(store.getParentLock()).toBeNull();
    expect(createStore(storage).getRounds()).toEqual([]);
  });

  it('leaves keys belonging to other apps alone', () => {
    const storage = createMemoryStorage();
    storage.setItem('someone-elses-key', 'keep me');
    const store = createStore(storage);
    store.appendRound(entry(1));

    store.clearAll();

    expect(storage.getItem('someone-elses-key')).toBe('keep me');
  });
});

describe('when storage cannot be written', () => {
  it('reports that progress is not being saved', () => {
    const store = createStore(readOnlyStorage());
    store.appendRound(entry(1));
    expect(store.persistent).toBe(false);
  });

  it('keeps working for the rest of the session', () => {
    const store = createStore(readOnlyStorage());
    store.appendRound(entry(1));
    store.saveSettings({ studySeconds: 45, recallSeconds: 20 });
    expect(store.getRounds()).toHaveLength(1);
    expect(store.getSettings()).toEqual({ studySeconds: 45, recallSeconds: 20 });
  });

  it('reports itself persistent while writes succeed', () => {
    const store = createStore(createMemoryStorage());
    store.appendRound(entry(1));
    expect(store.persistent).toBe(true);
  });
});

describe('when storage is entirely unavailable', () => {
  it('falls back to memory instead of crashing', () => {
    const exploding: StorageLike = {
      get length(): number {
        throw new Error('blocked');
      },
      key: () => {
        throw new Error('blocked');
      },
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createStore(exploding);
    expect(() => store.appendRound(entry(1))).not.toThrow();
    expect(store.getRounds()).toHaveLength(1);
    expect(store.persistent).toBe(false);
  });
});

describe('schema version', () => {
  it('is stamped on first write', () => {
    const storage = createMemoryStorage();
    createStore(storage).saveSettings(DEFAULT_SETTINGS);
    expect(storage.getItem(`${KEY_PREFIX}schema`)).toBe('1');
  });

  it('ignores data written by a newer version of the app', () => {
    const storage = createMemoryStorage();
    createStore(storage).appendRound(entry(1));
    storage.setItem(`${KEY_PREFIX}schema`, '99');
    expect(createStore(storage).getRounds()).toEqual([]);
  });
});

describe('shipped defaults', () => {
  it('studies for 15 seconds and allows 30 to find them', () => {
    expect(DEFAULT_SETTINGS).toEqual({ studySeconds: 15, recallSeconds: 30 });
  });
});
