import { el } from './dom';

/**
 * Coins and diamonds, drawn with CSS rather than emoji. Emoji render
 * differently on every platform and would undercut the typography.
 */
export function mark(kind: 'coin' | 'gem'): HTMLElement {
  return el('span', { class: `mark mark--${kind}` });
}
