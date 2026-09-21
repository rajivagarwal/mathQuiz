import { OP_GLYPH, answerOf, factId } from '../../domain/facts';
import type { DragResult, DragRound } from '../../domain/dragRound';
import { FACTS_PER_ROUND } from '../../domain/round';
import { el, screen, type Screen } from '../dom';
import { mark } from '../marks';

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

function rewardBlock(reward: StepReward): HTMLElement[] {
  if (!reward.passed) {
    return [
      el('div', {
        class: 'reward',
        children: [
          el('span', { text: 'Those five come back. Next try is worth' }),
          el('span', {
            class: 'reward__coins',
            children: [mark('coin'), el('span', { text: String(reward.coins) })],
          }),
        ],
      }),
    ];
  }

  const blocks: (HTMLElement | null)[] = [
    el('div', {
      class: 'reward reward--won',
      children: [
        el('span', { text: `Step ${reward.step} cleared` }),
        el('span', {
          class: 'reward__coins',
          children: [mark('coin'), el('span', { text: `+${reward.coins}` })],
        }),
      ],
    }),
    reward.diamond
      ? el('div', {
          class: 'reward reward--gem',
          children: [
            mark('gem'),
            el('span', { text: `A diamond. That makes ${reward.diamonds}.` }),
          ],
        })
      : null,
  ];

  return blocks.filter((node): node is HTMLElement => node !== null);
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

  const element = screen('screen', [
    el('div', {
      class: 'verdict',
      children: [
        el('span', { class: 'verdict__score', text: String(result.score) }),
        el('span', { class: 'prompt', text: `out of ${FACTS_PER_ROUND}` }),
      ],
    }),
    ...rewardBlock(reward),
    rows,
    el('div', {
      class: 'actions',
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
    }),
  ]);

  return { element };
}
