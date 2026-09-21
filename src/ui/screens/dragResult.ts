import { OP_GLYPH, answerOf, factId } from '../../domain/facts';
import type { DragResult, DragRound } from '../../domain/dragRound';
import { FACTS_PER_ROUND } from '../../domain/round';
import { el, screen, type Screen } from '../dom';
import { mark } from '../marks';
import { paintStepBadge } from '../stepBadge';

/** Beat timings for the cleared-step sequence, in milliseconds. */
const FLIP_MIDPOINT = 430;
const STARS_AT = 900;
const STAR_STAGGER = 110;
const ACTIONS_AT = 1560;

export interface StepReward {
  readonly step: number;
  readonly passed: boolean;
  /** Coins won when passed, or what the next try is worth when not. */
  readonly coins: number;
  /** True when clearing this step also won a diamond. */
  readonly diamond: boolean;
  readonly diamonds: number;
}

export interface DragResultProps {
  readonly round: DragRound;
  readonly result: DragResult;
  readonly reward: StepReward;
  /** Next step when passed, another try at the same five when not. */
  readonly onContinue: () => void;
  readonly onMap: () => void;
}

/** The badge the child just walked, ready to be spun. */
function clearedBlock(reward: StepReward): { block: HTMLElement; badge: HTMLElement } {
  const badge = el('div', { class: 'node--static node--unclaimed node--spin' });
  paintStepBadge(badge, { step: reward.step, state: 'done', earned: reward.coins });

  // Stars arrive one after another once the disc has landed.
  badge.querySelectorAll<HTMLElement>('.star--on i').forEach((star, index) => {
    star.style.animationDelay = `${index * STAR_STAGGER}ms`;
  });

  const block = el('div', {
    class: 'clear',
    children: [
      badge,
      el('p', { class: 'clear__title', text: `Step ${reward.step} cleared` }),
      el('div', {
        class: 'reward reward--won',
        children: [
          el('span', { text: 'You won' }),
          el('span', {
            class: 'reward__coins',
            children: [mark('coin'), el('span', { text: `+${reward.coins}` })],
          }),
        ],
      }),
      reward.diamond
        ? el('div', {
            class: 'reward reward--gem',
            children: [mark('gem'), el('span', { text: `A diamond. That makes ${reward.diamonds}.` })],
          })
        : null,
    ],
  });

  return { block, badge };
}

export function dragResultScreen({
  round,
  result,
  reward,
  onContinue,
  onMap,
}: DragResultProps): Screen {
  // Verdicts come back in study order. Show them in the order the child just
  // played them, so the board they remember is the board they are reading.
  const byFact = new Map(result.verdicts.map((verdict) => [verdict.factId, verdict]));
  const ordered = round.prompts
    .map((fact) => byFact.get(factId(fact)))
    .filter((verdict) => verdict !== undefined);

  const rows = el('div', {
    class: 'equations equations--drag equations--fixed',
    children: ordered.map((verdict) => {
      const { fact } = verdict;
      return el('div', {
        class: 'eq',
        children: [
          el('span', { text: String(fact.left) }),
          el('span', { class: 'op', text: OP_GLYPH[fact.op] }),
          el('span', { text: String(fact.right) }),
          el('span', { class: 'is', text: '=' }),
          el('span', {
            class: verdict.correct ? 'ans ans--true' : 'ans ans--false',
            text: verdict.placedValue === null ? '—' : String(verdict.placedValue),
          }),
          el('span', { class: 'fix', text: verdict.correct ? '' : String(answerOf(fact)) }),
        ],
      });
    }),
  });

  const cleared = reward.passed ? clearedBlock(reward) : null;

  const actions = el('div', {
    class: cleared ? 'actions actions--held' : 'actions',
    children: [
      el('button', {
        class: 'btn btn--primary btn--big',
        text: reward.passed ? 'Next step' : 'Try again',
        attrs: { type: 'button' },
        onClick: onContinue,
      }),
      el('button', {
        class: 'btn btn--quiet',
        text: 'Back to the map',
        attrs: { type: 'button' },
        onClick: onMap,
      }),
    ],
  });

  const element = screen('screen', [
    cleared
      ? cleared.block
      : el('div', {
          class: 'verdict',
          children: [
            el('span', { class: 'verdict__score', text: String(result.score) }),
            el('span', { class: 'prompt', text: `out of ${FACTS_PER_ROUND}` }),
          ],
        }),
    cleared
      ? null
      : el('div', {
          class: 'reward',
          children: [
            el('span', { text: 'Those five come back. Next try is worth' }),
            el('span', {
              class: 'reward__coins',
              children: [mark('coin'), el('span', { text: String(reward.coins) })],
            }),
          ],
        }),
    rows,
    actions,
  ]);

  const timers: number[] = [];

  if (cleared) {
    const { badge } = cleared;
    const land = (): void => badge.classList.remove('node--unclaimed');
    const shine = (): void => badge.classList.add('node--celebrate');
    const offer = (): void => {
      actions.classList.replace('actions--held', 'actions--in');
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // No spin to wait for, so the result is simply there.
      badge.classList.remove('node--spin');
      land();
      shine();
      offer();
    } else {
      // The disc turns gold while it is edge-on, so the change is never seen
      // happening -- it has simply become gold by the time it faces front.
      timers.push(window.setTimeout(land, FLIP_MIDPOINT));
      timers.push(window.setTimeout(shine, STARS_AT));
      timers.push(window.setTimeout(offer, ACTIONS_AT));
    }
  }

  return { element, destroy: () => timers.forEach(window.clearTimeout) };
}
