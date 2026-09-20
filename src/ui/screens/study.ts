import { OP_GLYPH, answerOf, type Fact } from '../../domain/facts';
import { browserCountdown } from '../countdown';
import { el, screen, type Screen } from '../dom';

export interface StudyProps {
  readonly facts: readonly Fact[];
  readonly durationMs: number;
  /** Called when the timer runs out or the child says they are ready. */
  readonly onDone: (studyMs: number) => void;
}

const URGENT_MS = 5000;

export function studyScreen({ facts, durationMs, onDone }: StudyProps): Screen {
  const fill = el('div', { class: 'bar__fill' });
  const bar = el('div', { class: 'bar', children: [fill] });
  const clock = el('span', { class: 'clock', text: String(Math.ceil(durationMs / 1000)) });

  // Five rows of five cells, so the operators and equals signs form columns.
  const equations = el('div', {
    class: 'equations',
    children: facts.map((fact) =>
      el('div', {
        class: 'eq',
        children: [
          el('span', { text: String(fact.left) }),
          el('span', { class: 'op', text: OP_GLYPH[fact.op] }),
          el('span', { text: String(fact.right) }),
          el('span', { class: 'is', text: '=' }),
          el('span', { text: String(answerOf(fact)) }),
        ],
      }),
    ),
  });

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    countdown.stop();
    onDone(countdown.elapsedMs());
  };

  const countdown = browserCountdown(
    durationMs,
    (remaining) => {
      fill.style.transform = `scaleX(${remaining / durationMs})`;
      clock.textContent = String(Math.ceil(remaining / 1000));
      bar.classList.toggle('bar--urgent', remaining <= URGENT_MS);
    },
    finish,
  );
  countdown.start();

  const element = screen('screen', [
    el('div', { class: 'topbar', children: [bar, clock] }),
    el('p', { class: 'prompt', text: 'Remember these five' }),
    equations,
    el('button', {
      class: 'btn btn--big',
      text: "I'm ready",
      onClick: finish,
      attrs: { type: 'button' },
    }),
  ]);

  return { element, destroy: () => countdown.stop() };
}
