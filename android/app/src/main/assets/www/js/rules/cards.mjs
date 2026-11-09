const small = '一二三四五六七八九十';
const large = '壹贰叁肆伍陆柒捌玖拾';
export const types = Array.from({ length: 20 }, (_, card) => card);
export const cardName = card => (small + large)[card];
export const isRed = card => [1, 6, 9].includes(card % 10);
export const sortCards = cards => cards.sort((a, b) => a - b);
export const countCard = (cards, card) => cards.filter(value => value === card).length;

export function takeCards(hand, cards) {
  const rest = [...hand];
  for (const card of cards) rest.splice(rest.indexOf(card), 1);
  return rest;
}

export function hasCards(hand, cards) {
  return cards.every(card => countCard(hand, card) >= countCard(cards, card));
}

export function patterns(oneFiveTen) {
  const groups = [];
  for (const base of [0, 10]) {
    for (let n = 0; n < 8; n++) groups.push([base + n, base + n + 1, base + n + 2]);
    groups.push([base + 1, base + 6, base + 9]);
    if (oneFiveTen) groups.push([base, base + 4, base + 9]);
  }
  for (let n = 0; n < 10; n++) groups.push([n, n, n + 10], [n, n + 10, n + 10]);
  return groups;
}

export function huxi({ type, cards }) {
  const big = cards[0] >= 10;
  switch (type) {
    case '碰': return big ? 3 : 1;
    case '坎':
    case '偎': return big ? 6 : 3;
    case '跑': return big ? 9 : 6;
    case '提': return big ? 12 : 9;
    case '吃': {
      const points = cards.map(card => card % 10).join(',');
      const special = ['0,1,2', '1,6,9', '0,4,9'].includes(points);
      return special ? (big ? 6 : 3) : 0;
    }
    default: return 0;
  }
}
