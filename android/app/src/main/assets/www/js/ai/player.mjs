import { countCard, isRed, takeCards } from '../rules/cards.mjs';

function mahjongValue(hand, patterns) {
  const cards = new Set(hand);
  const pairs = [...cards].filter(card => countCard(hand, card) >= 2).length;
  return pairs + patterns.reduce((total, sequence) => {
    const matches = sequence.filter(card => cards.has(card)).length;
    return total + (matches === 3 ? 5 : matches === 2 ? 1 : 0);
  }, 0);
}

function chooseMahjongAction(round) {
  const { options, phase, players, seat, rules, offer } = round;
  if (options[0].type === '胡') return options[0];
  const hand = players[seat].hand;
  const value = cards => mahjongValue(cards, rules.patterns);
  if (phase === 'claim') {
    const improved = [...new Set(hand)].some(card =>
      card !== offer.card && value([...takeCards(hand, [card]), offer.card]) > value(hand));
    return options[improved ? 0 : 1];
  }
  return options.reduce((best, action) =>
    value(takeCards(hand, [action.card])) > value(takeCards(hand, [best.card])) ? action : best);
}

export function chooseAction(round) {
  if (round.rules.mode === 'mahjong') return chooseMahjongAction(round);
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
