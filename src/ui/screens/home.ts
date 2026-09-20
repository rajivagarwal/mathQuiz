import type { KidProgress } from '../../domain/stats';
import { el, screen, type Screen } from '../dom';
import { plural } from '../format';

export interface HomeProps {
  readonly progress: KidProgress;
  /** Shown once after a round is abandoned. */
  readonly notice: string | null;
  readonly storageWorking: boolean;
  readonly onStartFind: () => void;
  readonly onStartDrag: () => void;
  readonly onProgress: () => void;
  readonly onParent: () => void;
}

function headline(progress: KidProgress): string {
  if (progress.totalRounds === 0) return 'Remember five equations, then prove it.';
  if (progress.currentPerfectStreak >= 2) {
    return `${progress.currentPerfectStreak} perfect rounds in a row.`;
  }
  if (progress.roundsToday > 0) return `${plural(progress.roundsToday, 'round')} played today.`;
  return 'Back for more?';
}

export function homeScreen(props: HomeProps): Screen {
  const { progress } = props;
  const learned = progress.mastered / progress.totalFacts;

  const element = screen('screen', [
    props.storageWorking
      ? null
      : el('p', {
          class: 'banner',
          text: 'This browser will not save anything, so progress disappears when you leave.',
        }),

    props.notice ? el('p', { class: 'banner', text: props.notice }) : null,

    el('div', {
      class: 'hero',
      children: [
        el('h1', { class: 'wordmark', text: 'Math\nFlash' }),
        el('p', { class: 'streak', text: headline(progress) }),
        el('div', {
          children: [
            el('div', { class: 'meter', children: [
              el('div', { class: 'meter__fill' }),
            ] }),
            el('p', {
              class: 'quiet',
              text: `${progress.mastered} of ${progress.totalFacts} facts learned`,
            }),
          ],
        }),
      ],
    }),

    el('div', {
      class: 'actions',
      children: [
        el('button', {
          class: 'btn btn--primary btn--big',
          text: 'Find the five',
          attrs: { type: 'button' },
          onClick: props.onStartFind,
        }),
        el('button', {
          class: 'btn btn--big',
          text: 'Drag the answers',
          attrs: { type: 'button' },
          onClick: props.onStartDrag,
        }),
        el('div', {
          class: 'row',
          children: [
            el('button', {
              class: 'btn btn--quiet',
              text: 'My progress',
              attrs: { type: 'button' },
              onClick: props.onProgress,
            }),
            el('button', {
              class: 'btn btn--quiet',
              text: 'Parents',
              attrs: { type: 'button' },
              onClick: props.onParent,
            }),
          ],
        }),
      ],
    }),
  ]);

  // The wordmark carries a hard newline; let it wrap as written.
  const mark = element.querySelector('.wordmark');
  if (mark) (mark as HTMLElement).style.whiteSpace = 'pre-line';

  const fill = element.querySelector<HTMLElement>('.meter__fill');
  if (fill) fill.style.width = `${Math.max(learned * 100, learned > 0 ? 2 : 0)}%`;

  return { element };
}
