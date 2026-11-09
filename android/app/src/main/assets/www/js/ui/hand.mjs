import { countCard, hasCards, huxi, takeCards } from '../rules/cards.mjs';

export function arrangeHand(hand, patterns) {
  let remaining = hand;
  const stacks = [];
  for (const card of new Set(hand)) {
    if (countCard(remaining, card) >= 3) {
      const cards = [card, card, card];
      stacks.push(cards);
      remaining = takeCards(remaining, cards);
    }
  }
  const preferred = [...patterns].sort((a, b) =>
    huxi({ type: '吃', cards: b }) - huxi({ type: '吃', cards: a }));
  for (const cards of preferred) {
    while (hasCards(remaining, cards)) {
      stacks.push(cards);
      remaining = takeCards(remaining, cards);
    }
  }
  for (const card of new Set(remaining)) {
    if (countCard(remaining, card) === 2) {
      const cards = [card, card];
      stacks.push(cards);
      remaining = takeCards(remaining, cards);
    }
  }
  const loose = [];
  for (let index = 0; index < remaining.length; index += 3) {
    loose.push(remaining.slice(index, index + 3));
  }
  return { stacks, loose };
}
