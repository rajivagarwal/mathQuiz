/**
 * Wiring and the round state machine: home -> study -> recall -> result.
 *
 * Two game types share that shape. "Find the five" hides the studied equations
 * among near-miss fakes; "Drag the answers" takes the answers away and hands
 * them back as loose tiles. Both study the same five facts and both feed the
 * same spaced-repetition records, so the choice changes how a round is played,
 * not what it teaches.
 *
 * Screens are plain functions returning DOM. This module owns all the state
 * they read and every effect they cause, so a screen never touches storage.
 */

import { biometricsAvailable, createParentLock } from './auth/parentLock';
import { factId, type Fact } from './domain/facts';
import {
  buildDragRound,
  gradeDragRound,
  type DragResult,
  type DragRound,
} from './domain/dragRound';
import {
  FACTS_PER_ROUND,
  buildRound,
  gradeRound,
  type Round,
  type RoundResult,
} from './domain/round';
import { applyOutcome, localDay, newRecord, selectFacts } from './domain/scheduler';
import { kidProgress, parentStats } from './domain/stats';
import { createRng, randomSeed } from './lib/rng';
import { createStore, type GameMode, type Settings } from './storage/store';
import type { Screen } from './ui/dom';
import { dragScreen } from './ui/screens/drag';
import { dragResultScreen } from './ui/screens/dragResult';
import { homeScreen } from './ui/screens/home';
import { parentScreen, type ParentMode } from './ui/screens/parent';
import { progressScreen } from './ui/screens/progress';
import { recallScreen } from './ui/screens/recall';
import { resultScreen } from './ui/screens/result';
import { studyScreen } from './ui/screens/study';

/** How many past rounds count as "asked recently" for the scheduler. */
const RECENT_ROUNDS = 3;

type Game =
  | { readonly mode: 'find'; readonly round: Round }
  | { readonly mode: 'drag'; readonly round: DragRound };

type Outcome =
  | { readonly mode: 'find'; readonly round: Round; readonly result: RoundResult }
  | { readonly mode: 'drag'; readonly round: DragRound; readonly result: DragResult };

type View =
  | { readonly name: 'home'; readonly notice: string | null }
  | { readonly name: 'study'; readonly game: Game; readonly seed: number }
  | {
      readonly name: 'recall';
      readonly game: Game;
      readonly seed: number;
      readonly studyMs: number;
    }
  | { readonly name: 'result'; readonly outcome: Outcome }
  | { readonly name: 'progress' }
  | { readonly name: 'parent'; readonly error: string | null; readonly busy: boolean };

interface RoundRecord {
  readonly mode: GameMode;
  readonly facts: readonly Fact[];
  readonly verdicts: readonly { readonly factId: string; readonly correct: boolean }[];
  readonly score: number;
  readonly perfect: boolean;
  readonly seed: number;
  readonly studyMs: number;
  readonly recallMs: number;
}

export function createApp(root: HTMLElement): void {
  const store = createStore();
  const lock = createParentLock(store);

  let biometrics = false;
  let current: Screen | null = null;
  let view: View = { name: 'home', notice: null };
  /** So "Next round" offers the same game type the child just played. */
  let lastMode: GameMode = 'drag';

  const show = (next: View): void => {
    view = next;
    render();
  };

  // ---- rounds -------------------------------------------------------------

  const startRound = (mode: GameMode): void => {
    try {
      const rounds = store.getRounds();
      const recentFactIds = rounds.slice(-RECENT_ROUNDS).flatMap((round) => round.factIds);
      const seed = randomSeed();
      const rng = createRng(seed);

      const facts = selectFacts({
        records: store.getFactRecords(),
        recentFactIds,
        count: FACTS_PER_ROUND,
        rng,
      });

      const game: Game =
        mode === 'find'
          ? { mode: 'find', round: buildRound(facts, rng) }
          : { mode: 'drag', round: buildDragRound(facts, rng) };

      lastMode = mode;
      show({ name: 'study', game, seed });
    } catch {
      show({ name: 'home', notice: 'Could not start a round. Try again.' });
    }
  };

  /** Both game types land here, so mastery advances identically either way. */
  const recordRound = (round: RoundRecord): void => {
    const at = new Date();
    const day = localDay(at);
    const records = store.getFactRecords();

    store.saveFactRecords(
      round.verdicts.map((verdict) =>
        applyOutcome(records.get(verdict.factId) ?? newRecord(verdict.factId), verdict.correct, {
          day,
          at: at.toISOString(),
        }),
      ),
    );

    store.appendRound({
      at: at.toISOString(),
      mode: round.mode,
      day,
      seed: round.seed,
      factIds: round.facts.map(factId),
      verdicts: round.verdicts.map((verdict) => ({
        factId: verdict.factId,
        correct: verdict.correct,
      })),
      score: round.score,
      perfect: round.perfect,
      studyMs: Math.round(round.studyMs),
      recallMs: Math.round(round.recallMs),
    });
  };

  // ---- parent area --------------------------------------------------------

  const parentMode = (): ParentMode => {
    if (!lock.isEnrolled()) return 'setup';
    return lock.isUnlocked() ? 'unlocked' : 'locked';
  };

  const runLockAction = (action: () => Promise<void>): void => {
    show({ name: 'parent', error: null, busy: true });
    action().then(
      () => show({ name: 'parent', error: null, busy: false }),
      (error: unknown) =>
        show({
          name: 'parent',
          error: error instanceof Error ? error.message : 'That did not work.',
          busy: false,
        }),
    );
  };

  const validPin = (pin: string): boolean => /^\d{4,6}$/.test(pin);

  // ---- rendering ----------------------------------------------------------

  const buildScreen = (): Screen => {
    switch (view.name) {
      case 'home':
        return homeScreen({
          progress: kidProgress(store.getRounds(), store.getFactRecords(), localDay(new Date())),
          notice: view.notice,
          storageWorking: store.persistent,
          onStartFind: () => startRound('find'),
          onStartDrag: () => startRound('drag'),
          onProgress: () => show({ name: 'progress' }),
          onParent: () => show({ name: 'parent', error: null, busy: false }),
        });

      case 'study': {
        const { game, seed } = view;
        return studyScreen({
          facts: game.round.facts,
          durationMs: store.getSettings().studySeconds * 1000,
          onDone: (studyMs) => show({ name: 'recall', game, seed, studyMs }),
        });
      }

      case 'recall': {
        const { game, seed, studyMs } = view;
        const durationMs = store.getSettings().recallSeconds * 1000;

        if (game.mode === 'find') {
          const { round } = game;
          return recallScreen({
            round,
            durationMs,
            onDone: (selected, recallMs) => {
              const result = gradeRound(round, selected);
              recordRound({ mode: 'find', facts: round.facts, ...result, seed, studyMs, recallMs });
              show({ name: 'result', outcome: { mode: 'find', round, result } });
            },
          });
        }

        const { round } = game;
        return dragScreen({
          round,
          durationMs,
          onDone: (placements, recallMs) => {
            const result = gradeDragRound(round, placements);
            recordRound({ mode: 'drag', facts: round.facts, ...result, seed, studyMs, recallMs });
            show({ name: 'result', outcome: { mode: 'drag', round, result } });
          },
        });
      }

      case 'result': {
        const { outcome } = view;
        const onNext = (): void => startRound(lastMode);
        const onHome = (): void => show({ name: 'home', notice: null });

        return outcome.mode === 'find'
          ? resultScreen({ round: outcome.round, result: outcome.result, onNext, onHome })
          : dragResultScreen({ round: outcome.round, result: outcome.result, onNext, onHome });
      }

      case 'progress':
        return progressScreen({
          progress: kidProgress(store.getRounds(), store.getFactRecords(), localDay(new Date())),
          onBack: () => show({ name: 'home', notice: null }),
        });

      case 'parent': {
        const { error, busy } = view;
        return parentScreen({
          mode: parentMode(),
          biometrics,
          stats: parentStats(store.getRounds(), store.getFactRecords()),
          settings: store.getSettings(),
          error,
          busy,
          onEnrolBiometric: () => runLockAction(() => lock.enrolBiometric()),
          onUnlockBiometric: () => runLockAction(() => lock.unlockBiometric()),
          onEnrolPin: (pin) =>
            validPin(pin)
              ? runLockAction(() => lock.enrolPin(pin))
              : show({ name: 'parent', error: 'Use 4 to 6 digits.', busy: false }),
          onUnlockPin: (pin) =>
            validPin(pin)
              ? runLockAction(() => lock.unlockPin(pin))
              : show({ name: 'parent', error: 'Use 4 to 6 digits.', busy: false }),
          onSaveSettings: (settings: Settings) => store.saveSettings(settings),
          onClearAll: () => {
            store.clearAll();
            lock.forget();
            show({ name: 'home', notice: 'Everything has been erased.' });
          },
          onBack: () => show({ name: 'home', notice: null }),
        });
      }
    }
  };

  function render(): void {
    current?.destroy?.();
    current = buildScreen();
    root.replaceChildren(current.element);
  }

  // A round left running in the background could be studied indefinitely, and a
  // recall timer that kept draining while the phone was locked would be unfair.
  // Either way the round is discarded rather than recorded.
  const abandonIfPlaying = (): void => {
    if (view.name !== 'study' && view.name !== 'recall') return;
    show({ name: 'home', notice: 'Round cancelled. Start again when you are ready.' });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') abandonIfPlaying();
  });
  window.addEventListener('pagehide', abandonIfPlaying);

  render();

  // Availability is only needed on the parent screen, so let the first paint go
  // out first and re-render if the answer changes anything.
  void biometricsAvailable().then((available) => {
    biometrics = available;
    if (view.name === 'parent') render();
  });
}
