import { countCard, hasCards, takeCards } from './cards.mjs';
import { findHu, findOpeningHu } from './hu.mjs?v=250';

// Seat indices are bottom, left, right and (in four-player rounds) top.
const nextByCount = { 3: [2, 0, 1], 4: [2, 0, 3, 1], 5: [2, 0, 3, 4, 1] };
export const nextSeat = (seat, seats = 3) => nextByCount[seats][seat];

export function canHuFrom(kind, rules) {
  return kind !== 'discard' || rules.discardHu;
}

export function ownForcedMeld(player, card) {
  const count = countCard(player.hand, card);
  if (count === 2) return { type: '偎', cards: [card, card], priority: 1, forced: true };
  const previous = player.groups.findIndex(group => group.type === '偎' && group.cards[0] === card);
  if (count === 3 || previous >= 0) {
    return { type: '提', cards: count === 3 ? [card, card, card] : [], previous, priority: 1, forced: true };
  }
  return null;
}

export function concealedDraw(round) {
  const { phase, offer, options, rules } = round;
  if (rules.openMelds !== false || phase !== 'response' || offer?.kind !== 'draw') return false;
  const action = options[0];
  return action.type === '提' || (action.type === '偎' && !round.players[offer.source].passedPeng.has(offer.card));
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
  if (kind === 'opening') {
    const hu = findOpeningHu(player, card, self, rules);
    return hu ? [{ type: '胡', hu, priority: 2, ...(hu.special ? { forced: true } : {}) }] : [];
  }

  const ownDraw = self && kind === 'draw';
  if (ownDraw) {
    const forced = ownForcedMeld(player, card);
    if (forced) return [forced];
  }

  const count = countCard(player.hand, card);
  const previous = player.groups.findIndex(group =>
    ['偎', '碰'].includes(group.type) && group.cards[0] === card);
  const previousType = previous === -1 ? null : player.groups[previous].type;
  const actions = [];

  if (canHuFrom(kind, rules)) {
    const hu = findHu(player, card, ownDraw, rules);
    if (hu) actions.push({ type: '胡', hu, priority: 2 });
  }
  if (count === 3 || previousType === '偎' || (previousType === '碰' && kind !== 'discard')) {
    actions.push({
      type: '跑', cards: count === 3 ? [card, card, card] : [], previous,
      priority: 3, forced: true
    });
  }
  if (player.chongpao) return actions;
  if (!self && count === 2 && !player.passedPeng.has(card) && !player.ownDiscards.includes(card)) {
    actions.push({ type: '碰', cards: [card, card], priority: 3 });
  }
  if ((ownDraw || seat === nextSeat(source, rules.seats)) && !player.passedChi.has(card)) {
    actions.push(...eatOptions(player, card, rules));
  }
  return actions;
}
