import { OP_GLYPH, factId } from '../../domain/facts';
import type { DragRound, Tile } from '../../domain/dragRound';
import { FACTS_PER_ROUND } from '../../domain/round';
import { browserCountdown } from '../countdown';
import { el, screen, type Screen } from '../dom';

export interface DragProps {
  readonly round: DragRound;
  readonly durationMs: number;
  readonly onDone: (placements: Map<string, string>, recallMs: number) => void;
}

const URGENT_MS = 5000;

/** How far a pointer must travel before a press counts as a drag, not a tap. */
const DRAG_THRESHOLD_PX = 6;

/** Clearance between the dragged tile and the pointer, wide enough that a
    fingertip does not cover the slot being aimed at. */
const GHOST_GAP_PX = 44;

export function dragScreen({ round, durationMs, onDone }: DragProps): Screen {
  const fill = el('div', { class: 'bar__fill' });
  const bar = el('div', { class: 'bar', children: [fill] });
  const clock = el('span', { class: 'clock', text: String(Math.ceil(durationMs / 1000)) });
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

  const highlight = (slot: HTMLButtonElement | null): void => {
    for (const button of slots.values()) button.classList.remove('slot--over');
    slot?.classList.add('slot--over');
  };

  const select = (tileId: string | null): void => {
    selected = tileId;
    for (const [id, button] of tileButtons) {
      button.classList.toggle('tile--selected', id === selected);
    }
  };

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    countdown.stop();
    clearGhost();
    onDone(new Map(placements), countdown.elapsedMs());
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

      // The ghost rides above the pointer rather than under it: on a phone a
      // fingertip would otherwise cover the slot being aimed at. Hit testing
      // still uses the pointer itself, which is what the child is pointing with.
      ghost?.style.setProperty(
        'transform',
        `translate(${moveEvent.clientX - rect.width / 2}px, ${moveEvent.clientY - GHOST_GAP_PX - rect.height}px)`,
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

      return el('div', {
        class: 'eq',
        children: [
          el('span', { text: String(fact.left) }),
          el('span', { class: 'op', text: OP_GLYPH[fact.op] }),
          el('span', { text: String(fact.right) }),
          el('span', { class: 'is', text: '=' }),
          slot,
        ],
      });
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
    el('div', {
      class: 'headline-row',
      children: [el('p', { class: 'prompt', text: 'Put each answer back' }), counter],
    }),
    equations,
    tray,
  ]);

  return {
    element,
    destroy: () => {
      countdown.stop();
      clearGhost();
    },
  };
}
