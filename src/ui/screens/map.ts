/**
 * The progress map, ported from the Math Forest design in `design/math-forest-map`.
 *
 * The backdrop is a painted tile that already contains the trail, so nothing is
 * drawn over it: the steps sit on anchor points measured as fractions of a tile,
 * which is what keeps them in the clearing however wide the phone is. The tile
 * repeats vertically and the strip is built to a whole number of tiles, so the
 * seams land exactly where the anchor grid does.
 */

import {
  coinsAtStep,
  currentStep,
  diamonds,
  isDiamondStep,
  totalCoins,
  type Journey,
} from '../../domain/journey';
import { COINS_PER_STEP } from '../../domain/journey';
import { el, screen, type Screen } from '../dom';

export interface MapProps {
  readonly journey: Journey;
  /** Shown once after a step is abandoned or the data is erased. */
  readonly notice: string | null;
  readonly storageWorking: boolean;
  readonly onPlay: () => void;
  readonly onProgress: () => void;
  readonly onParent: () => void;
}

/** Step positions within one tile, as fractions of tile width and height. */
const ANCHORS: readonly (readonly [number, number])[] = [
  [0.45, 0.0714],
  [0.58, 0.2143],
  [0.43, 0.3571],
  [0.56, 0.5],
  [0.44, 0.6429],
  [0.58, 0.7857],
  [0.45, 0.9286],
];

const PER_TILE = ANCHORS.length;

/** The artwork's own proportions: 616 x 1280. */
const TILE_RATIO = 1280 / 616;

/** The path is endless, so only a window around the child is drawn. */
const STEPS_BEHIND = 8;
const STEPS_AHEAD = 6;

/** Geometry of one step, matching the design's 140 x 128 box. */
const BADGE_CX = 70;
const BADGE_CY = 56;
const STAR_ARC_DEGREES = 104;

/** How high above the bottom of the whole strip a step sits, in tiles. */
function heightInTiles(step: number): number {
  const tile = Math.floor((step - 1) / PER_TILE);
  // Anchors run top-first; steps run bottom-first, so the index is mirrored.
  const anchor = ANCHORS[PER_TILE - 1 - ((step - 1) % PER_TILE)] as readonly [number, number];
  return tile + 1 - anchor[1];
}

function anchorX(step: number): number {
  const anchor = ANCHORS[PER_TILE - 1 - ((step - 1) % PER_TILE)] as readonly [number, number];
  return anchor[0];
}

/** Five stars on an arc under the badge, each tilted along the curve. */
function starArc(parent: HTMLElement, earned: number, radius: number): void {
  for (let i = 0; i < COINS_PER_STEP; i++) {
    const degrees =
      90 - STAR_ARC_DEGREES / 2 + (STAR_ARC_DEGREES * i) / (COINS_PER_STEP - 1);
    const radians = (degrees * Math.PI) / 180;

    const star = el('span', {
      class: i < earned ? 'star star--on' : 'star',
      children: [el('i')],
    });
    star.style.left = `${BADGE_CX + Math.cos(radians) * radius}px`;
    star.style.top = `${BADGE_CY + Math.sin(radians) * radius}px`;
    star.style.transform = `translate(-50%, -50%) rotate(${(degrees - 90).toFixed(1)}deg)`;
    parent.append(star);
  }
}

function woodenSign(): HTMLElement {
  return el('div', {
    class: 'sign',
    children: [
      el('span', { class: 'sign__leaf sign__leaf--a' }),
      el('span', { class: 'sign__leaf sign__leaf--b' }),
      el('div', {
        class: 'sign__board',
        children: [
          el('span', { class: 'sign__stud sign__stud--tl' }),
          el('span', { class: 'sign__stud sign__stud--br' }),
          el('div', { class: 'sign__line sign__line--top', text: 'Math' }),
          el('div', { class: 'sign__line sign__line--bottom', text: 'Flash' }),
        ],
      }),
    ],
  });
}

export function mapScreen(props: MapProps): Screen {
  const { journey } = props;
  const current = currentStep(journey);
  const lowest = Math.max(1, current - STEPS_BEHIND);
  const highest = current + STEPS_AHEAD;

  const inner = el('div', { class: 'strip' });
  // Scenery is a public asset, so its URL has to carry the deployed base path.
  inner.style.backgroundImage = `url(${import.meta.env.BASE_URL}scenery/forest-tile.jpg)`;
  const nodes: { readonly step: number; readonly element: HTMLElement }[] = [];
  let currentNode: HTMLElement | null = null;

  for (let step = lowest; step <= highest; step++) {
    const done = step < current;
    const here = step === current;
    const milestone = !done && !here && isDiamondStep(step);

    const state = done ? 'done' : here ? 'current' : milestone ? 'milestone' : 'locked';
    const node = el('button', {
      class: `node node--${state}`,
      attrs: { type: 'button', disabled: !here, 'aria-label': `Step ${step}` },
    });

    // Wrapper holds the pole; only the pennant inside it waves.
    if (milestone) node.append(el('span', { class: 'node__flag', children: [el('i')] }));

    node.append(
      el('span', {
        class: 'node__disc',
        children: here
          ? [
              el('span', { class: 'node__label', text: 'Step' }),
              el('span', { class: 'node__num', text: String(step) }),
            ]
          : [el('span', { class: 'node__num', text: String(step) })],
      }),
    );

    starArc(node, done ? (coinsAtStep(journey, step) ?? 0) : 0, here ? 58 : 51);

    if (here) {
      node.addEventListener('click', props.onPlay);
      currentNode = node;
    }

    nodes.push({ step, element: node });
    inner.append(node);
  }

  const path = el('div', { class: 'path', children: [inner] });

  /**
   * Tile height follows the width, so every position is measured at layout time
   * rather than baked in. The strip is a whole number of tiles tall and starts
   * on a tile boundary, which is what makes the repeat line up with the anchors.
   */
  const layout = (): void => {
    const width = inner.clientWidth;
    if (width === 0) return;

    const tileHeight = width * TILE_RATIO;
    const bottomTile = Math.floor(heightInTiles(lowest));
    const topTile = Math.ceil(heightInTiles(highest));
    const tiles = Math.max(1, topTile - bottomTile);
    const height = tiles * tileHeight;

    inner.style.height = `${height}px`;
    // 470 is the design's frame width; below that everything shrinks together.
    inner.style.setProperty('--node-scale', String(Math.min(1, width / 470)));
    inner.style.backgroundSize = `100% ${tileHeight}px`;

    for (const { step, element } of nodes) {
      element.style.left = `${anchorX(step) * width}px`;
      element.style.top = `${height - (heightInTiles(step) - bottomTile) * tileHeight}px`;
    }
  };

  const element = screen('map', [
    props.storageWorking
      ? null
      : el('p', {
          class: 'banner',
          text: 'This browser will not save anything, so progress disappears when you leave.',
        }),
    props.notice ? el('p', { class: 'banner', text: props.notice }) : null,

    path,

    el('div', {
      class: 'hud',
      children: [
        woodenSign(),
        el('div', {
          class: 'purse',
          children: [
            el('span', {
              class: 'purse__item',
              children: [
                el('span', { class: 'mark mark--gem' }),
                el('span', { text: String(diamonds(journey)) }),
              ],
            }),
            el('span', {
              class: 'purse__item',
              children: [
                el('span', { class: 'mark mark--coin' }),
                el('span', { text: String(totalCoins(journey)) }),
              ],
            }),
          ],
        }),
      ],
    }),

    el('div', {
      class: 'map__footer',
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
  ]);

  const frame = requestAnimationFrame(() => {
    layout();
    if (!currentNode) return;
    const target = currentNode.offsetTop - path.clientHeight * 0.58;
    path.scrollTop = Math.max(0, Math.min(target, path.scrollHeight - path.clientHeight));
  });

  window.addEventListener('resize', layout);

  return {
    element,
    destroy: () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', layout);
    },
  };
}
