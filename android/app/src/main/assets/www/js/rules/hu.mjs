import { countCard, hasCards, huxi, isRed, sortCards, takeCards } from './cards.mjs';

function bestSplit(hand, pairs, patterns, openTriplet, memo) {
  if (!hand.length) return pairs === 0 ? { huxi: 0, groups: [] } : null;
  const key = `${pairs}:${hand.join(',')}`;
  if (memo.has(key)) return memo.get(key);

  const first = hand[0];
  const count = countCard(hand, first);
  const candidates = [];
  if (pairs && count >= 2) candidates.push({ type: '对', cards: [first, first] });
  if (count >= 3 && first !== openTriplet) candidates.push({ type: '坎', cards: [first, first, first] });
  for (const cards of patterns) {
    if (cards.includes(first) && hasCards(hand, cards)) candidates.push({ type: '吃', cards });
  }

  let best = null;
  for (const group of candidates) {
    const rest = bestSplit(takeCards(hand, group.cards), pairs - (group.type === '对'), patterns, openTriplet, memo);
    if (!rest) continue;
    const score = huxi(group) + rest.huxi;
    if (!best || score > best.huxi) best = { huxi: score, groups: [group, ...rest.groups] };
  }
  memo.set(key, best);
  return best;
}

export function findHu(player, card, selfDraw, rules) {
  let hand = player.hand;
  const fixed = [...player.groups];
  if (card !== null) {
    if (countCard(hand, card) === 2 && !selfDraw) {
      // Compare a winning triplet with using the same card in a sequence.
      const triplet = { type: '碰', cards: [card, card, card] };
      const tripletHu = findHu({ hand: takeCards(hand, [card, card]), groups: [...fixed, triplet] }, null, false, rules);
      const sequenceHu = evaluate(sortCards([...hand, card]), fixed, rules, card);
      if (!tripletHu) return sequenceHu;
      return sequenceHu && sequenceHu.huxi > tripletHu.huxi ? sequenceHu : tripletHu;
    }
    hand = sortCards([...hand, card]);
  }
  return evaluate(hand, fixed, rules);
}

function evaluate(hand, fixed, rules, openTriplet = -1) {
  const locked = [...fixed];
  // A dealt triplet remains a kan. An offered third card may go into a sequence.
  for (const card of new Set(hand)) {
    if (card === openTriplet || countCard(hand, card) !== 3) continue;
    const cards = [card, card, card];
    locked.push({ type: '坎', cards });
    hand = takeCards(hand, cards);
  }
  if (hand.length % 3 === 1) return null;
  const patterns = rules.patterns;
  const split = bestSplit(hand, hand.length % 3 === 2 ? 1 : 0, patterns, openTriplet, new Map());
  if (!split) return null;
  const groups = [...locked, ...split.groups];
  if (groups.length !== (rules.dealt + 1) / 3) return null;
  const score = groups.reduce((total, group) => total + huxi(group), 0);
  const red = groups.flatMap(group => group.cards).filter(isRed).length;
  const minimum = rules.mode === 'fifteen' && red === 0 ? 10 : rules.minimum;
  return score >= minimum ? { huxi: score, groups, red } : null;
}
