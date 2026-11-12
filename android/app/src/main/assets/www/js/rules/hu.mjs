import { countCard, hasCards, huxi, isRed, sortCards, takeCards } from './cards.mjs';
import { tunForHuxi } from './scoring.mjs?v=65';

function bestSplit(hand, pairs, score, search) {
  const { patterns, openTriplet, minimum, compare, memo } = search;
  if (!hand.length) return pairs === 0 && score >= minimum ? { huxi: score, groups: [] } : null;
  // The same remaining cards can score differently depending on the accumulated Hu Xi.
  const key = `${pairs}:${score}:${hand.join(',')}`;
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
    const rest = bestSplit(takeCards(hand, group.cards), pairs - (group.type === '对'), score + huxi(group), search);
    if (!rest) continue;
    if (!best || compare(rest.huxi, best.huxi) > 0) best = { huxi: rest.huxi, groups: [group, ...rest.groups] };
  }
  memo.set(key, best);
  return best;
}

export function findHu(player, card, selfDraw, rules) {
  let hand = player.hand;
  const fixed = player.groups;
  const passedHu = player.passedHu ?? -1;
  // Every split uses the same cards and winning source, so the settlement multipliers are identical.
  const compare = rules.mode === 'ten'
    ? (a, b) => tunForHuxi(a, rules) - tunForHuxi(b, rules) || a - b
    : (a, b) => a - b;
  if (card !== null) {
    const count = countCard(hand, card);
    // A fourth copy must go through the forced meld before checking Hu.
    if (count === 3) return null;
    if (count === 2 && !selfDraw) {
      // Compare a winning triplet with using the same card in a sequence.
      const triplet = { type: '碰', cards: [card, card, card] };
      const tripletHu = evaluate(takeCards(hand, [card, card]), [...fixed, triplet], rules, compare, passedHu);
      const sequenceHu = evaluate(sortCards([...hand, card]), fixed, rules, compare, passedHu, card);
      if (!tripletHu) return sequenceHu;
      return sequenceHu && compare(sequenceHu.huxi, tripletHu.huxi) > 0 ? sequenceHu : tripletHu;
    }
    hand = sortCards([...hand, card]);
  }
  return evaluate(hand, fixed, rules, compare, passedHu);
}

function evaluate(hand, fixed, rules, compare, passedHu, openTriplet = -1) {
  const locked = [...fixed];
  // A dealt triplet remains a kan. An offered third card may go into a sequence.
  for (const card of new Set(hand)) {
    if (card === openTriplet || countCard(hand, card) !== 3) continue;
    const cards = [card, card, card];
    locked.push({ type: '坎', cards });
    hand = takeCards(hand, cards);
  }
  if (hand.length % 3 === 1) return null;
  const red = hand.filter(isRed).length + locked.flatMap(group => group.cards).filter(isRed).length;
  const minimum = Math.max(passedHu + 1, rules.mode === 'fifteen' && red === 0 ? 10 : rules.minimum);
  const score = locked.reduce((total, group) => total + huxi(group), 0);
  const search = { patterns: rules.patterns, openTriplet, minimum, compare, memo: new Map() };
  const split = bestSplit(hand, hand.length % 3 === 2 ? 1 : 0, score, search);
  if (!split) return null;
  const groups = [...locked, ...split.groups];
  if (groups.length !== (rules.dealt + 1) / 3) return null;
  return { huxi: split.huxi, groups, red };
}
