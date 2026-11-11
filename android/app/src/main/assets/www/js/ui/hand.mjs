import { countCard, hasCards, huxi, sortCards, takeCards } from '../rules/cards.mjs';
import { findMahjongHu } from '../rules/mahjong.mjs';

export function arrangeHand(hand, patterns, mahjong = false) {
  const hu = mahjong && findMahjongHu(hand);
  if (hu) return { stacks: hu.groups.map(({ cards }) => cards), loose: [] };
  let remaining = hand;
  const stacks = [];
  for (const card of mahjong ? [] : new Set(hand)) {
    const count = countCard(remaining, card);
    if (count >= 3) {
      const cards = Array(count).fill(card);
      stacks.push(cards);
      remaining = takeCards(remaining, cards);
    }
  }
  const preferred = mahjong ? patterns : [...patterns].sort((a, b) =>
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

export function createHandLayout(hand, patterns, mahjong = false) {
  const { stacks, loose } = arrangeHand(hand, patterns, mahjong);
  let id = 0;
  return [...stacks, ...loose].map(column => column.map(card => ({ id: id++, card })));
}

export function handColumnGroup(column, patterns, mahjong = false) {
  const cards = sortCards(column.map(({ card }) => card));
  if (cards.length > 1 && (!mahjong || cards.length === 2) && cards.every(card => card === cards[0])) {
    return { type: ['对', '坎', '提'][cards.length - 2], cards };
  }
  if (cards.length === 3 && patterns.some(pattern => pattern.every((card, index) => card === cards[index]))) {
    return { type: '吃', cards };
  }
  return null;
}

export function eatPreviewIds(layout, patterns, cards) {
  function takeMatching(column, needed) {
    return column.filter(({ card }) => {
      const index = needed.indexOf(card);
      if (index === -1) return false;
      needed.splice(index, 1);
      return true;
    });
  }

  const needed = [...cards];
  const loose = [];
  const groups = [];
  for (const column of layout) {
    const group = handColumnGroup(column, patterns);
    if (group) groups.push({ column, points: huxi(group) });
    else loose.push(...takeMatching(column, needed));
  }

  let best;
  // Compare whole sets of columns so one group can supply several needed cards.
  function chooseGroups(start, remaining, tiles, count, points) {
    if (remaining.length === 0) {
      if (!best || count < best.count || (count === best.count && points < best.points)) {
        best = { tiles, count, points };
      }
      return;
    }
    if (best && count >= best.count) return;

    for (let index = start; index < groups.length; index++) {
      const group = groups[index];
      const rest = [...remaining];
      const matching = takeMatching(group.column, rest);
      if (matching.length) {
        chooseGroups(index + 1, rest, [...tiles, ...matching], count + 1, points + group.points);
      }
    }
  }
  chooseGroups(0, needed, [], 0, 0);
  return new Set([...loose, ...(best?.tiles ?? [])].map(({ id }) => id));
}

export function moveHandCard(layout, source, target) {
  const next = layout.map(column => [...column]);
  const [card] = next[source.column].splice(source.index, 1);
  if (target.newColumn) next.splice(target.column, 0, [card]);
  else {
    const index = target.index - Number(target.column === source.column && source.index < target.index);
    next[target.column].splice(index, 0, card);
  }
  const columns = next.filter(column => column.length);
  if (columns.length === layout.length && columns.every((column, i) =>
    column.length === layout[i].length && column.every((tile, j) => tile === layout[i][j]))) return layout;
  return columns;
}

export function syncHandLayout(layout, hand, patterns, preferredIds, mahjong = false) {
  const previous = layout.flat();
  const remaining = new Map();
  for (const card of hand) remaining.set(card, (remaining.get(card) ?? 0) + 1);
  const remove = new Map();
  for (const { card } of previous) remove.set(card, (remove.get(card) ?? 0) + 1);
  for (const [card, count] of remaining) remove.set(card, (remove.get(card) ?? 0) - count);

  // When copies are interchangeable, use the previewed card or a loose card first.
  const loose = layout.filter(column => !handColumnGroup(column, patterns, mahjong)).flat();
  const candidates = [...previous.filter(({ id }) => preferredIds.has(id)), ...loose, ...previous];
  const removed = new Set();
  for (const { id, card } of candidates) {
    if (!removed.has(id) && remove.get(card) > 0) {
      removed.add(id);
      remove.set(card, remove.get(card) - 1);
    }
  }
  const columns = layout.map(column => column.filter(({ id }) => !removed.has(id))).filter(column => column.length);
  let id = Math.max(-1, ...previous.map(tile => tile.id)) + 1;
  for (const [card, count] of remove) {
    for (let added = 0; added < -count; added++) {
      columns.push([{ id: id++, card }]);
    }
  }
  return columns;
}
