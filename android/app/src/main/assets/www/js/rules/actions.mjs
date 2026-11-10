import { countCard, hasCards, takeCards } from './cards.mjs';
import { findHu } from './hu.mjs?v=65';

// Seat 0 is at the bottom, seat 1 is on the left, and seat 2 is on the right.
export const nextSeat = seat => (seat + 2) % 3;

export function canHuFrom(kind, rules) {
  return kind === 'draw' || rules.discardHu;
}

function companions(hand, card, patterns) {
  if (!hand.includes(card)) return [[]];
  return patterns.filter(group => group.includes(card) && hasCards(hand, group))
    .flatMap(group => companions(takeCards(hand, group), card, patterns)
      .map(rest => [group, ...rest]));
}

function eatOptions(player, card, rules) {
  const hand = player.hand.filter(value => countCard(player.hand, value) < 3);
  const seen = new Set();
  return rules.patterns.filter(group => group.includes(card)).flatMap(group => {
    const own = takeCards(group, [card]);
    if (!hasCards(hand, own)) return [];
    return companions(takeCards(hand, own), card, rules.patterns)
      .map(rest => ({ type: '吃', cards: own, groups: [group, ...rest], priority: 5 }));
  }).filter(({ groups }) => {
    const key = groups.map(group => group.join(',')).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function responses(player, seat, { card, source, kind }, rules) {
  const self = seat === source;
  if (self && kind === 'discard') return [];
  if (kind === 'opening' && !self && rules.mode === 'fifteen') return [];

  const count = countCard(player.hand, card);
  const previous = player.groups.findIndex(group =>
    ['偎', '碰'].includes(group.type) && group.cards[0] === card);
  const previousType = previous === -1 ? null : player.groups[previous].type;
  const ownDraw = self && kind !== 'discard';
  const actions = [];

  if (ownDraw && count === 2) {
    return [{ type: '偎', cards: [card, card], priority: 1, forced: true }];
  }
  if (ownDraw && (count === 3 || previousType === '偎')) {
    return [{ type: '提', cards: count === 3 ? [card, card, card] : [], previous, priority: 1, forced: true }];
  }

  if (canHuFrom(kind, rules)) {
    const hu = findHu(player, card, ownDraw, rules);
    if (hu) actions.push({ type: '胡', hu, priority: 2 });
  }
  if (kind === 'opening' && !self) return actions;
  if (count === 3 || previousType === '偎' || (previousType === '碰' && kind !== 'discard')) {
    actions.push({
      type: '跑', cards: count === 3 ? [card, card, card] : [], previous,
      priority: 3, forced: true
    });
  }
  if (kind === 'opening') return actions;
  if (!self && count === 2 && !player.passedPeng.has(card)) {
    actions.push({ type: '碰', cards: [card, card], priority: 3 });
  }
  if ((ownDraw || seat === nextSeat(source)) && !player.passedChi.has(card)) {
    actions.push(...eatOptions(player, card, rules));
  }
  return actions;
}
