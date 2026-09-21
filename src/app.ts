/**
 * Wiring, and the step machine behind the progress map.
 *
 * A step is cleared by getting all five facts right in one go. Anything less
 * and the same five come back, worth one coin less, until they are cleared.
 *
 * The five facts and the attempt count live here in memory and are never
 * stored, which is what makes closing the app deal a fresh hand at full price.
 * The map itself keeps only the coins won at each finished step.
 */

import { biometricsAvailable, createParentLock } from './auth/parentLock';
import { factId, type Fact } from './domain/facts';
import { buildDragRound, gradeDragRound, type DragResult, type DragRound } from './domain/dragRound';
import {
  coinsForAttempt,
  completeStep,
  currentStep,
  diamonds,
  isDiamondStep,
  type Journey,
} from './domain/journey';
import { FACTS_PER_ROUND, gradeRound, type Round, type RoundResult } from './domain/round';
import { applyOutcome, localDay, newRecord, selectFacts } from './domain/scheduler';
import { kidProgress, parentStats } from './domain/stats';
import { createRng, randomSeed } from './lib/rng';
import { createStore, type GameMode, type Settings } from './storage/store';
import type { Screen } from './ui/dom';
import { dragScreen } from './ui/screens/drag';
import { dragResultScreen, type StepReward } from './ui/screens/dragResult';
import { mapScreen } from './ui/screens/map';
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
  | {
      readonly mode: 'drag';
      readonly round: DragRound;
      readonly result: DragResult;
      readonly reward: StepReward;
    };

type View =
  | { readonly name: 'map'; readonly notice: string | null }
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

  let journey: Journey = store.getJourney();
  /** Which try at the current step this is. Session only: never stored. */
  let attempt = 1;
  /** The five facts this step is about, held so a retry asks the same ones. */
  let stepFacts: Fact[] | null = null;

  let biometrics = false;
  let current: Screen | null = null;
  let view: View = { name: 'map', notice: null };

  const show = (next: View): void => {
    view = next;
    render();
  };

  // ---- steps --------------------------------------------------------------

  const startStep = (): void => {
    try {
      if (!stepFacts) {
        const recentFactIds = store
          .getRounds()
          .slice(-RECENT_ROUNDS)
          .flatMap((round) => round.factIds);

        stepFacts = selectFacts({
          records: store.getFactRecords(),
          recentFactIds,
          count: FACTS_PER_ROUND,
          rng: createRng(randomSeed()),
        });
      }

      // A fresh seed every attempt: the same five facts, but new spare tiles, a
      // new tray order and a new prompt order, so a retry tests what was
      // remembered rather than where things happened to sit last time.
      const seed = randomSeed();
      show({ name: 'study', game: { mode: 'drag', round: buildDragRound(stepFacts, createRng(seed)) }, seed });
    } catch {
      stepFacts = null;
      show({ name: 'map', notice: 'Could not start that step. Try again.' });
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

  /** Clears the step on a clean sweep, or charges a coin and keeps the facts. */
  const settleStep = (perfect: boolean): StepReward => {
    const step = currentStep(journey);

    if (!perfect) {
      attempt += 1;
      return {
        step,
        passed: false,
        coins: coinsForAttempt(attempt),
        diamond: false,
        diamonds: diamonds(journey),
      };
    }

    const earned = coinsForAttempt(attempt);
    journey = completeStep(journey, attempt);
    store.saveJourney(journey);
    attempt = 1;
    stepFacts = null;

    return {
      step,
      passed: true,
      coins: earned,
      diamond: isDiamondStep(step),
      diamonds: diamonds(journey),
    };
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
      case 'map':
        return mapScreen({
          journey,
          notice: view.notice,
          storageWorking: store.persistent,
          onPlay: startStep,
          onProgress: () => show({ name: 'progress' }),
          onParent: () => show({ name: 'parent', error: null, busy: false }),
        });

      case 'study': {
        const { game, seed } = view;
        const settings = store.getSettings();
        return studyScreen({
          facts: game.round.facts,
          durationMs: settings.timed ? settings.studySeconds * 1000 : null,
          onDone: (studyMs) => show({ name: 'recall', game, seed, studyMs }),
        });
      }

      case 'recall': {
        const { game, seed, studyMs } = view;
        const settings = store.getSettings();
        const durationMs = settings.timed ? settings.recallSeconds * 1000 : null;

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
            const reward = settleStep(result.perfect);
            show({ name: 'result', outcome: { mode: 'drag', round, result, reward } });
          },
        });
      }

      case 'result': {
        const { outcome } = view;
        const onMap = (): void => show({ name: 'map', notice: null });

        return outcome.mode === 'find'
          ? resultScreen({
              round: outcome.round,
              result: outcome.result,
              onNext: startStep,
              onHome: onMap,
            })
          : dragResultScreen({
              round: outcome.round,
              result: outcome.result,
              reward: outcome.reward,
              onContinue: startStep,
              onMap,
            });
      }

      case 'progress':
        return progressScreen({
          progress: kidProgress(store.getRounds(), store.getFactRecords(), localDay(new Date())),
          journey,
          onBack: () => show({ name: 'map', notice: null }),
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
            journey = store.getJourney();
            attempt = 1;
            stepFacts = null;
            show({ name: 'map', notice: 'Everything has been erased.' });
          },
          onBack: () => show({ name: 'map', notice: null }),
        });
      }
    }
  };

  function render(): void {
    current?.destroy?.();
    current = buildScreen();
    root.replaceChildren(current.element);
  }

  // A step left running in the background could be studied indefinitely, and a
  // recall timer that kept draining while the phone was locked would be unfair.
  // The attempt is discarded without being recorded and without costing a coin,
  // and the same five facts are still waiting on the map.
  const abandonIfPlaying = (): void => {
    if (view.name !== 'study' && view.name !== 'recall') return;
    show({ name: 'map', notice: 'Step cancelled. Tap it again when you are ready.' });
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
