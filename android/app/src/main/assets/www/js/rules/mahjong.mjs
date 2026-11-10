import { countCard, hasCards, patterns, sortCards, takeCards } from './cards.mjs';

export const mahjongPatterns = patterns(true).filter(([first, , last]) => last - first < 10);

function splitSequences(hand) {
  if (!hand.length) return [];
  for (const cards of mahjongPatterns) {
    if (!cards.includes(hand[0]) || !hasCards(hand, cards)) continue;
    const rest = splitSequences(takeCards(hand, cards));
    if (rest) return [{ type: '吃', cards }, ...rest];
  }
  return null;
}

export function findMahjongHu(cards) {
  if (cards.length !== 11) return null;
  const hand = sortCards([...cards]);
  for (const card of new Set(hand)) {
    if (countCard(hand, card) < 2) continue;
    const pair = [card, card];
    const groups = splitSequences(takeCards(hand, pair));
    if (groups) return { groups: [...groups, { type: '对', cards: pair }] };
  }
  return null;
}
