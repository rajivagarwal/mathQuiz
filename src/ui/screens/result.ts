import { lhsText } from '../../domain/facts';
import { FACTS_PER_ROUND, cardClusters, type Round, type RoundResult } from '../../domain/round';
import { el, screen, type Screen } from '../dom';
import { cardFace } from './recall';

export interface ResultProps {
  readonly round: Round;
  readonly result: RoundResult;
  readonly onNext: () => void;
  readonly onHome: () => void;
}

function summary(result: RoundResult): string {
  if (result.perfect) return 'All five. Perfect round.';
  if (result.score === 0) return 'None this time. The green ones were the real answers.';
  const missed = result.verdicts.filter((verdict) => !verdict.correct).map((v) => lhsText(v.fact));
  return `Missed ${missed.join(', ')}.`;
}

export function resultScreen({ round, result, onNext, onHome }: ResultProps): Screen {
  const selected = new Set(result.selectedCardIds);

  const grid = el('div', {
    class: 'grid',
    children: cardClusters(round).map((cluster) =>
      el('div', {
        class: 'cluster',
        children: cluster.map((card) => {
          const button = cardFace(card);
          button.disabled = true;

          if (card.isTrue && selected.has(card.id)) button.classList.add('card--true');
          else if (card.isTrue) button.classList.add('card--missed');
          else if (selected.has(card.id)) button.classList.add('card--false');
          else button.classList.add('card--dim');

          return button;
        }),
      }),
    ),
  });

  const element = screen('screen', [
    el('div', {
      class: 'verdict',
      children: [
        el('span', {
          class: 'verdict__score',
          text: result.perfect ? String(FACTS_PER_ROUND) : String(result.score),
        }),
        el('span', { class: 'prompt', text: `out of ${FACTS_PER_ROUND}` }),
      ],
    }),
    el('p', { class: 'quiet', text: summary(result) }),
    grid,
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
