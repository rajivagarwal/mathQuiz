import { completedSteps, diamonds, totalCoins, type Journey } from '../../domain/journey';
import type { KidProgress } from '../../domain/stats';
import { mark } from '../marks';
import { el, screen, type Screen } from '../dom';
import { plural } from '../format';

export interface ProgressProps {
  readonly progress: KidProgress;
  readonly journey: Journey;
  readonly onBack: () => void;
}

function rewardTile(glyph: HTMLElement, value: string, label: string): HTMLElement {
  return el('div', {
    class: 'stat',
    children: [
      el('div', {
        class: 'stat__value stat__value--reward',
        children: [glyph, el('span', { text: value })],
      }),
      el('div', { class: 'stat__label', text: label }),
    ],
  });
}

function tile(value: string, label: string): HTMLElement {
  return el('div', {
    class: 'stat',
    children: [
      el('div', { class: 'stat__value', text: value }),
      el('div', { class: 'stat__label', text: label }),
    ],
  });
}

export function progressScreen({ progress, journey, onBack }: ProgressProps): Screen {
  if (progress.totalRounds === 0) {
    return {
      element: screen('screen', [
        el('h2', { text: 'My progress' }),
        el('div', {
          class: 'centered',
          children: [
            el('p', { class: 'prompt', text: 'Nothing here yet.' }),
            el('p', { class: 'quiet', text: 'Play a round and your stars turn up here.' }),
          ],
        }),
        el('button', {
          class: 'btn btn--big',
          text: 'Back',
          attrs: { type: 'button' },
          onClick: onBack,
        }),
      ]),
    };
  }

  const learned = progress.mastered / progress.totalFacts;

  const meter = el('div', { class: 'meter', children: [el('div', { class: 'meter__fill' })] });

  const element = screen('screen screen--scroll', [
    el('h2', { text: 'My progress' }),

    el('div', {
      class: 'stats',
      children: [
        rewardTile(mark('gem'), String(diamonds(journey)), 'diamonds'),
        rewardTile(mark('coin'), String(totalCoins(journey)), 'gold coins'),
        tile(String(completedSteps(journey)), 'steps cleared'),
        tile(String(progress.perfectToday), 'perfect rounds today'),
        tile(String(progress.roundsToday), 'rounds today'),
        tile(String(progress.currentPerfectStreak), 'perfect in a row now'),
        tile(String(progress.bestPerfectStreak), 'best run ever'),
      ],
    }),

    el('div', {
      children: [
        el('h3', { text: 'Facts learned' }),
        meter,
        el('p', {
          class: 'quiet',
          text: `${progress.mastered} learned, ${progress.learning} on the way, ${progress.totalFacts} in total.`,
        }),
      ],
    }),

    el('p', { class: 'quiet', text: `${plural(progress.totalRounds, 'round')} played altogether.` }),

    el('div', { class: 'spacer' }),

    el('button', {
      class: 'btn btn--big',
      text: 'Back',
      attrs: { type: 'button' },
      onClick: onBack,
    }),
  ]);

  const fill = element.querySelector<HTMLElement>('.meter__fill');
  if (fill) fill.style.width = `${Math.max(learned * 100, learned > 0 ? 2 : 0)}%`;

  return { element };
}
