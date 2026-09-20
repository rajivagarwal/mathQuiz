import { OP_GLYPH, factId } from '../../domain/facts';
import type { DragRound, Tile } from '../../domain/dragRound';
import { FACTS_PER_ROUND } from '../../domain/round';
import { browserCountdown, type Countdown } from '../countdown';
import { el, screen, type Screen } from '../dom';

export interface DragProps {
  readonly round: DragRound;
  /** Null runs the phase without a clock: it ends on Done, or at five placements. */
  readonly durationMs: number | null;
  readonly onDone: (placements: Map<string, string>, recallMs: number) => void;
}

const URGENT_MS = 5000;

/** How far a pointer must travel before a press counts as a drag, not a tap. */
const DRAG_THRESHOLD_PX = 6;

export function dragScreen({ round, durationMs, onDone }: DragProps): Screen {
  const counter = el('span', { class: 'counter', text: `0 of ${FACTS_PER_ROUND}` });

  /** factId -> tileId. A placement is final once made. */
  const placements = new Map<string, string>();
  const slots = new Map<string, HTMLButtonElement>();
  const tileButtons = new Map<string, HTMLButtonElement>();
  let selected: string | null = null;
  let ghost: HTMLElement | null = null;

  const tileById = new Map(round.tiles.map((tile) => [tile.id, tile]));

  const clearGhost = (): void => {
    ghost?.remove();
    ghost = null;
  };

  /** Left-hand-side spans per equation, lit up while that row is the target. */
  const rowParts = new Map<string, HTMLElement[]>();

  const highlight = (slot: HTMLButtonElement | null): void => {
    for (const button of slots.values()) button.classList.remove('slot--over');
    for (const parts of rowParts.values()) {
      for (const part of parts) part.classList.remove('eq--target');
    }
    if (!slot) return;

    slot.classList.add('slot--over');
    const targeted = slot.dataset['fact'];
    for (const part of (targeted && rowParts.get(targeted)) || []) {
      part.classList.add('eq--target');
    }
  };

  const select = (tileId: string | null): void => {
    selected = tileId;
    for (const [id, button] of tileButtons) {
      button.classList.toggle('tile--selected', id === selected);
    }
  };

  const startedAt = performance.now();
  let countdown: Countdown | null = null;
  let finished = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    countdown?.stop();
    clearGhost();
    onDone(
      new Map(placements),
      countdown ? countdown.elapsedMs() : performance.now() - startedAt,
    );
  };

  const place = (slotFactId: string, tileId: string): void => {
    if (finished) return;
    // Both a filled slot and a spent tile are out of play: placements are final,
    // so trying tiles until one sticks cannot rescue the score.
    if (placements.has(slotFactId)) return;
    const tile = tileById.get(tileId);
    const slot = slots.get(slotFactId);
    if (!tile || !slot || [...placements.values()].includes(tileId)) return;

    placements.set(slotFactId, tileId);
    select(null);

    const right = tile.factId === slotFactId;
    slot.textContent = String(tile.value);
    slot.classList.add(right ? 'slot--true' : 'slot--false');
    slot.classList.remove('slot--over');
    slot.disabled = true;

    const button = tileButtons.get(tileId);
    button?.classList.add('tile--used');
    if (button) button.disabled = true;

    counter.textContent = `${placements.size} of ${FACTS_PER_ROUND}`;
    if (placements.size === FACTS_PER_ROUND) finish();
  };

  const slotUnder = (x: number, y: number): HTMLButtonElement | null => {
    const found = document.elementFromPoint(x, y)?.closest('.slot');
    return found instanceof HTMLButtonElement && !found.disabled ? found : null;
  };

  const startPress = (tile: Tile, button: HTMLButtonElement, event: PointerEvent): void => {
    if (button.disabled || finished) return;
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const rect = button.getBoundingClientRect();
    let dragging = false;

    button.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent): void => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!dragging && distance < DRAG_THRESHOLD_PX) return;

      if (!dragging) {
        dragging = true;
        select(null);
        ghost = el('div', { class: 'tile tile--ghost', text: String(tile.value) });
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        document.body.append(ghost);
        button.classList.add('tile--lifted');
      }

      // The tile rides under the pointer, where the hand expects it. The drop
      // target is signalled by lighting up the whole equation instead, which
      // stays visible past the edges of both the tile and a fingertip.
      ghost?.style.setProperty(
        'transform',
        `translate(${moveEvent.clientX - rect.width / 2}px, ${moveEvent.clientY - rect.height / 2}px)`,
      );
      highlight(slotUnder(moveEvent.clientX, moveEvent.clientY));
    };

    const end = (endEvent: PointerEvent): void => {
      button.removeEventListener('pointermove', move);
      button.removeEventListener('pointerup', end);
      button.removeEventListener('pointercancel', cancel);
      button.classList.remove('tile--lifted');
      clearGhost();
      highlight(null);

      if (!dragging) {
        // A press that never moved is a tap: arm the tile, then tap a slot.
        select(selected === tile.id ? null : tile.id);
        return;
      }

      const slot = slotUnder(endEvent.clientX, endEvent.clientY);
      const slotFactId = slot?.dataset['fact'];
      if (slotFactId) place(slotFactId, tile.id);
    };

    const cancel = (): void => {
      button.removeEventListener('pointermove', move);
      button.removeEventListener('pointerup', end);
      button.removeEventListener('pointercancel', cancel);
      button.classList.remove('tile--lifted');
      clearGhost();
      highlight(null);
    };

    button.addEventListener('pointermove', move);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', cancel);
  };

  const equations = el('div', {
    class: 'equations equations--drag',
    children: round.prompts.map((fact) => {
      const id = factId(fact);
      const slot = el('button', {
        class: 'slot',
        attrs: { type: 'button', 'data-fact': id, 'aria-label': 'Drop an answer here' },
      });

      slot.addEventListener('pointerup', () => {
        if (selected) place(id, selected);
      });
      // Keyboard-generated clicks report detail 0, which distinguishes them from
      // the pointer path above and keeps the screen usable without a pointer.
      slot.addEventListener('click', (event) => {
        if (event.detail === 0 && selected) place(id, selected);
      });

      slots.set(id, slot);

      const parts = [
        el('span', { text: String(fact.left) }),
        el('span', { class: 'op', text: OP_GLYPH[fact.op] }),
        el('span', { text: String(fact.right) }),
        el('span', { class: 'is', text: '=' }),
      ];
      rowParts.set(id, parts);

      return el('div', { class: 'eq', children: [...parts, slot] });
    }),
  });

  const tray = el('div', {
    class: 'tray',
    children: round.tiles.map((tile) => {
      const button = el('button', {
        class: 'tile',
        text: String(tile.value),
        attrs: { type: 'button', 'data-tile': tile.id },
      });
      button.addEventListener('pointerdown', (event) => startPress(tile, button, event));
      button.addEventListener('click', (event) => {
        if (event.detail === 0) select(selected === tile.id ? null : tile.id);
      });
      tileButtons.set(tile.id, button);
      return button;
    }),
  });

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

  // Without a clock the round would otherwise only end once all five slots are
  // filled, which strands a child who cannot place the rest.
  const done =
    durationMs === null
      ? el('button', {
          class: 'btn btn--big',
          text: 'Done',
          attrs: { type: 'button' },
          onClick: () => finish(),
        })
      : null;

  const element = screen('screen', [
    topbar,
    el('div', {
      class: 'headline-row',
      children: [el('p', { class: 'prompt', text: 'Put each answer back' }), counter],
    }),
    equations,
    tray,
    done,
  ]);

  return {
    element,
    destroy: () => {
      countdown?.stop();
      clearGhost();
    },
  };
}
