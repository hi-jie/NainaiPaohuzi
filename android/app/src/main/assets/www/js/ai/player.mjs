import { countCard, isRed } from '../rules/cards.mjs';

export function chooseAction(round) {
  if (round.phase !== 'discard') return round.options[0];
  const hand = round.players[round.seat].hand;
  const value = card => {
    const pairs = 3 * (countCard(hand, card) - 1);
    const neighbors = round.rules.patterns.filter(group =>
      group.includes(card) && group.some(other => other !== card && hand.includes(other))).length;
    return pairs + neighbors + Number(isRed(card));
  };
  return round.options.reduce((best, action) => value(action.card) < value(best.card) ? action : best);
}
