import { types } from '../rules/cards.mjs';

export function shuffledDeck(random) {
  const deck = types.flatMap(card => [card, card, card, card]);
  for (let end = deck.length - 1; end > 0; end--) {
    const index = Math.floor(random() * (end + 1));
    [deck[end], deck[index]] = [deck[index], deck[end]];
  }
  return deck;
}
