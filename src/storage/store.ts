/**
 * Everything the app remembers, in localStorage.
 *
 * Two things matter here beyond round-tripping JSON:
 *
 * - Nothing may throw. Private Browsing, a full quota and a locked-down
 *   WebView all make storage fail in ways that would otherwise take the whole
 *   app down mid-round. Every failure degrades to an in-memory store and flips
 *   `persistent` to false so the UI can say so.
 * - Stored data is untrusted. It may be corrupt, half-written, or written by a
 *   different version of the app, so every read validates and falls back.
 */

import type { FactRecord } from '../domain/scheduler';

export const SCHEMA_VERSION = 1;
export const KEY_PREFIX = 'mathquiz.v1.';

/** Roughly 125 KB of history, against a ~5 MB quota. */
export const MAX_ROUNDS = 500;

const KEY = {
  schema: `${KEY_PREFIX}schema`,
  facts: `${KEY_PREFIX}facts`,
  rounds: `${KEY_PREFIX}rounds`,
  settings: `${KEY_PREFIX}settings`,
  parent: `${KEY_PREFIX}parent`,
} as const;

/** The slice of the DOM Storage interface this app uses. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

export interface Settings {
  readonly studySeconds: number;
  readonly recallSeconds: number;
  /** When false, both phases run without a clock and end only on a tap. */
  readonly timed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  studySeconds: 15,
  recallSeconds: 30,
  timed: false,
};

export type GameMode = 'find' | 'drag';

export interface RoundLogEntry {
  readonly at: string;
  /** Absent on rounds logged before the second game type existed. */
  readonly mode?: GameMode;
  readonly day: string;
  readonly seed: number;
  readonly factIds: readonly string[];
  readonly verdicts: readonly { readonly factId: string; readonly correct: boolean }[];
  readonly score: number;
  readonly perfect: boolean;
  readonly studyMs: number;
  readonly recallMs: number;
}

export interface ParentLockRecord {
  readonly kind: 'webauthn' | 'pin';
  readonly credentialId?: string;
  readonly pinHash?: string;
  readonly salt?: string;
  readonly enrolledAt: string;
}

export interface Store {
  /** False once any write has failed: the UI should warn that progress is not saved. */
  readonly persistent: boolean;
  getSettings(): Settings;
  saveSettings(settings: Settings): void;
  getFactRecords(): Map<string, FactRecord>;
  saveFactRecords(records: readonly FactRecord[]): void;
  getRounds(): RoundLogEntry[];
  appendRound(entry: RoundLogEntry): void;
  getParentLock(): ParentLockRecord | null;
  saveParentLock(record: ParentLockRecord): void;
  clearAll(): void;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    return value === null || value === undefined ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

function defaultStorage(): StorageLike {
  try {
    const candidate = globalThis.localStorage as StorageLike | undefined;
    if (candidate) return candidate;
  } catch {
    // Storage access can throw outright when site data is blocked.
  }
  return createMemoryStorage();
}

export function createStore(storage?: StorageLike): Store {
  const backing = storage ?? defaultStorage();

  /** Authoritative overlay: written first, read first, always available. */
  const memory = new Map<string, string>();
  let persistent = true;
  let ignoreBacking = false;

  try {
    const version = backing.getItem(KEY.schema);
    // A version we do not recognise means data written by another build of the
    // app. Rather than risk misreading it, start clean. Future migrations hook
    // in here, upgrading in place instead of ignoring.
    if (version !== null && version !== String(SCHEMA_VERSION)) ignoreBacking = true;
  } catch {
    persistent = false;
  }

  const readRaw = (key: string): string | null => {
    const cached = memory.get(key);
    if (cached !== undefined) return cached;
    if (ignoreBacking) return null;
    try {
      return backing.getItem(key);
    } catch {
      return null;
    }
  };

  const writeRaw = (key: string, value: string): void => {
    memory.set(key, value);
    try {
      backing.setItem(KEY.schema, String(SCHEMA_VERSION));
      backing.setItem(key, value);
      ignoreBacking = false;
    } catch {
      persistent = false;
    }
  };

  const getSettings = (): Settings => {
    const stored = parseJson<Partial<Settings>>(readRaw(KEY.settings), {});
    return {
      studySeconds:
        typeof stored.studySeconds === 'number' && Number.isFinite(stored.studySeconds)
          ? stored.studySeconds
          : DEFAULT_SETTINGS.studySeconds,
      recallSeconds:
        typeof stored.recallSeconds === 'number' && Number.isFinite(stored.recallSeconds)
          ? stored.recallSeconds
          : DEFAULT_SETTINGS.recallSeconds,
      // Absent on settings saved before the toggle existed, so default to on.
      timed: typeof stored.timed === 'boolean' ? stored.timed : DEFAULT_SETTINGS.timed,
    };
  };

  const getFactRecords = (): Map<string, FactRecord> => {
    const stored = parseJson<Record<string, FactRecord>>(readRaw(KEY.facts), {});
    const records = new Map<string, FactRecord>();
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [id, record] of Object.entries(stored)) {
        if (record && typeof record === 'object') records.set(id, record);
      }
    }
    return records;
  };

  const getRounds = (): RoundLogEntry[] => {
    const stored = parseJson<RoundLogEntry[]>(readRaw(KEY.rounds), []);
    return Array.isArray(stored) ? stored : [];
  };

  return {
    get persistent(): boolean {
      return persistent;
    },

    getSettings,
    saveSettings: (settings) => writeRaw(KEY.settings, JSON.stringify(settings)),

    getFactRecords,
    saveFactRecords: (records) => {
      const merged = getFactRecords();
      for (const record of records) merged.set(record.factId, record);
      writeRaw(KEY.facts, JSON.stringify(Object.fromEntries(merged)));
    },

    getRounds,
    appendRound: (entry) => {
      const rounds = getRounds();
      rounds.push(entry);
      writeRaw(KEY.rounds, JSON.stringify(rounds.slice(-MAX_ROUNDS)));
    },

    getParentLock: () => parseJson<ParentLockRecord | null>(readRaw(KEY.parent), null),
    saveParentLock: (record) => writeRaw(KEY.parent, JSON.stringify(record)),

    clearAll: () => {
      memory.clear();
      ignoreBacking = false;
      try {
        // Collect first: removing while iterating by index skips entries.
        const ours: string[] = [];
        for (let i = 0; i < backing.length; i++) {
          const key = backing.key(i);
          if (key !== null && key.startsWith(KEY_PREFIX)) ours.push(key);
        }
        for (const key of ours) backing.removeItem(key);
      } catch {
        persistent = false;
      }
    },
  };
}
