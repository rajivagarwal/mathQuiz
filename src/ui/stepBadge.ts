/**
 * One step on the map: the numbered disc, its ring of stars, and a flag when it
 * is a milestone. Ported from design/math-forest-map.
 *
 * Shared because the result screen shows the very same badge when a step is
 * cleared -- it spins there and lands gold, which only reads as the step the
 * child just walked if it is built from the same parts.
 */

import { COINS_PER_STEP } from '../domain/journey';
import { el } from './dom';

export type StepState = 'done' | 'current' | 'locked' | 'milestone';

/** Geometry of one step, matching the design's 140 x 128 box. */
const BADGE_CX = 70;
const BADGE_CY = 56;
const STAR_ARC_DEGREES = 112;

export interface StepBadge {
  readonly step: number;
  readonly state: StepState;
  /** Stars lit, which is the coins that step was worth. */
  readonly earned: number;
}

/** Fills a caller-made root, so the map can use a button and the result a div. */
export function paintStepBadge(root: HTMLElement, badge: StepBadge): void {
  const { step, state, earned } = badge;
  root.classList.add('node', `node--${state}`);

  // Wrapper holds the pole; only the pennant inside it waves.
  if (state === 'milestone') root.append(el('span', { class: 'node__flag', children: [el('i')] }));

  root.append(
    el('span', {
      class: 'node__disc',
      children:
        state === 'current'
          ? [
              el('span', { class: 'node__label', text: 'Step' }),
              el('span', { class: 'node__num', text: String(step) }),
            ]
          : [el('span', { class: 'node__num', text: String(step) })],
    }),
  );

  // Five stars on an arc under the disc, each tilted along the curve.
  // Radius grew with the stars: at the old 51 they would overlap each other.
  const radius = state === 'current' ? 62 : 57;
  for (let i = 0; i < COINS_PER_STEP; i++) {
    const degrees = 90 - STAR_ARC_DEGREES / 2 + (STAR_ARC_DEGREES * i) / (COINS_PER_STEP - 1);
    const radians = (degrees * Math.PI) / 180;

    const star = el('span', {
      class: i < earned ? 'star star--on' : 'star',
      children: [el('i')],
    });
    star.style.left = `${BADGE_CX + Math.cos(radians) * radius}px`;
    star.style.top = `${BADGE_CY + Math.sin(radians) * radius}px`;
    star.style.transform = `translate(-50%, -50%) rotate(${(degrees - 90).toFixed(1)}deg)`;
    root.append(star);
  }
}
