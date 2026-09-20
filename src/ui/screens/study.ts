import { OP_GLYPH, answerOf, type Fact } from '../../domain/facts';
import { browserCountdown, type Countdown } from '../countdown';
import { el, screen, type Screen } from '../dom';

export interface StudyProps {
  readonly facts: readonly Fact[];
  /** Null runs the phase without a clock: it ends only when the child is ready. */
  readonly durationMs: number | null;
  readonly onDone: (studyMs: number) => void;
}

const URGENT_MS = 5000;

export function studyScreen({ facts, durationMs, onDone }: StudyProps): Screen {
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

  // Elapsed time is tracked either way, so an untimed round still records how
  // long it took. Only the countdown and its bar depend on there being a limit.
  const startedAt = performance.now();
  let countdown: Countdown | null = null;
  let finished = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    countdown?.stop();
    onDone(countdown ? countdown.elapsedMs() : performance.now() - startedAt);
  };

  let topbar: HTMLElement | null = null;
  if (durationMs !== null) {
    const fill = el('div', { class: 'bar__fill' });
    const bar = el('div', { class: 'bar', children: [fill] });
    const clock = el('span', { class: 'clock', text: String(Math.ceil(durationMs / 1000)) });
    topbar = el('div', { class: 'topbar', children: [bar, clock] });

    countdown = browserCountdown(
      durationMs,
      (remaining) => {
        fill.style.transform = `scaleX(${remaining / durationMs})`;
        clock.textContent = String(Math.ceil(remaining / 1000));
        bar.classList.toggle('bar--urgent', remaining <= URGENT_MS);
      },
      finish,
    );
    countdown.start();
  }

  const element = screen('screen', [
    topbar,
    el('p', { class: 'prompt', text: 'Remember these five' }),
    equations,
    el('button', {
      class: 'btn btn--big',
      text: "I'm ready",
      onClick: finish,
      attrs: { type: 'button' },
    }),
  ]);

  return { element, destroy: () => countdown?.stop() };
}
