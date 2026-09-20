import { OP_GLYPH, equationText } from '../../domain/facts';
import { MAX_SELECTIONS, cardClusters, type Card, type Round } from '../../domain/round';
import { browserCountdown } from '../countdown';
import { el, screen, type Screen } from '../dom';

export interface RecallProps {
  readonly round: Round;
  readonly durationMs: number;
  readonly onDone: (selectedCardIds: string[], recallMs: number) => void;
}

const URGENT_MS = 5000;

export function cardFace(card: Card): HTMLButtonElement {
  return el('button', {
    class: 'card',
    attrs: {
      type: 'button',
      'data-card': card.id,
      'aria-label': `${card.fact.left} ${OP_GLYPH[card.fact.op]} ${card.fact.right} equals ${card.rhs}`,
    },
    children: [el('span', { class: 'card__eq', text: equationText(card.fact, card.rhs) })],
  });
}

export function recallScreen({ round, durationMs, onDone }: RecallProps): Screen {
  const fill = el('div', { class: 'bar__fill' });
  const bar = el('div', { class: 'bar', children: [fill] });
  const clock = el('span', { class: 'clock', text: String(Math.ceil(durationMs / 1000)) });
  const counter = el('span', { class: 'counter', text: `0 of ${MAX_SELECTIONS}` });

  const picked = new Set<string>();
  const buttons = new Map<string, HTMLButtonElement>();

  const done = el('button', {
    class: 'btn btn--big btn--primary',
    text: 'Done',
    attrs: { type: 'button' },
    onClick: () => finish(),
  });

  const refresh = (): void => {
    counter.textContent = `${picked.size} of ${MAX_SELECTIONS}`;
    for (const [id, button] of buttons) {
      button.classList.toggle('card--picked', picked.has(id));
    }
    done.disabled = picked.size === 0;
  };

  const toggle = (id: string): void => {
    if (picked.has(id)) picked.delete(id);
    // Refuse a sixth pick rather than silently replacing one: the child has to
    // decide what to let go of.
    else if (picked.size < MAX_SELECTIONS) picked.add(id);
    refresh();
  };

  let dealt = 0;
  const grid = el('div', {
    class: 'grid grid--dealing',
    children: cardClusters(round).map((cluster) =>
      el('div', {
        class: 'cluster',
        children: cluster.map((card) => {
          const button = cardFace(card);
          button.style.animationDelay = `${dealt++ * 14}ms`;
          button.addEventListener('click', () => toggle(card.id));
          buttons.set(card.id, button);
          return button;
        }),
      }),
    ),
  });

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    countdown.stop();
    onDone([...picked], countdown.elapsedMs());
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
  refresh();

  const element = screen('screen', [
    el('div', { class: 'topbar', children: [bar, clock] }),
    el('div', {
      class: 'headline-row',
      children: [el('p', { class: 'prompt', text: 'Find the five you just saw' }), counter],
    }),
    grid,
    done,
  ]);

  return { element, destroy: () => countdown.stop() };
}
