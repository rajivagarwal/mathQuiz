import { OP_GLYPH, answerOf, factId } from '../../domain/facts';
import type { DragResult, DragRound } from '../../domain/dragRound';
import { FACTS_PER_ROUND } from '../../domain/round';
import { el, screen, type Screen } from '../dom';

export interface DragResultProps {
  readonly round: DragRound;
  readonly result: DragResult;
  readonly onNext: () => void;
  readonly onHome: () => void;
}

function summary(result: DragResult): string {
  if (result.perfect) return 'Every answer back where it belongs.';
  if (result.score === 0) return 'None this time. The green numbers are the real answers.';
  return 'The green numbers are the ones that were right.';
}

export function dragResultScreen({ round, result, onNext, onHome }: DragResultProps): Screen {
  // Verdicts come back in study order. Show them in the order the child just
  // played them, so the board they remember is the board they are reading.
  const byFact = new Map(result.verdicts.map((verdict) => [verdict.factId, verdict]));
  const ordered = round.prompts
    .map((fact) => byFact.get(factId(fact)))
    .filter((verdict) => verdict !== undefined);

  const rows = el('div', {
    class: 'equations equations--drag equations--fixed',
    children: ordered.map((verdict) => {
      const { fact } = verdict;
      const placed = el('span', {
        class: verdict.correct ? 'ans ans--true' : 'ans ans--false',
        text: verdict.placedValue === null ? '—' : String(verdict.placedValue),
      });

      return el('div', {
        class: 'eq',
        children: [
          el('span', { text: String(fact.left) }),
          el('span', { class: 'op', text: OP_GLYPH[fact.op] }),
          el('span', { text: String(fact.right) }),
          el('span', { class: 'is', text: '=' }),
          placed,
          verdict.correct
            ? el('span', { class: 'fix' })
            : el('span', { class: 'fix', text: String(answerOf(fact)) }),
        ],
      });
    }),
  });

  const element = screen('screen', [
    el('div', {
      class: 'verdict',
      children: [
        el('span', { class: 'verdict__score', text: String(result.score) }),
        el('span', { class: 'prompt', text: `out of ${FACTS_PER_ROUND}` }),
      ],
    }),
    el('p', { class: 'quiet', text: summary(result) }),
    rows,
    el('div', {
      class: 'actions',
      children: [
        el('button', {
          class: 'btn btn--primary btn--big',
          text: 'Next round',
          attrs: { type: 'button' },
          onClick: onNext,
        }),
        el('button', {
          class: 'btn btn--quiet',
          text: 'Stop for now',
          attrs: { type: 'button' },
          onClick: onHome,
        }),
      ],
    }),
  ]);

  return { element };
}
