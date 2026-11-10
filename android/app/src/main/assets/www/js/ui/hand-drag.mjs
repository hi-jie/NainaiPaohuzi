function bounds(element, portrait) {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  return portrait ? { left: top, right: bottom, top: -right, bottom: -left } : { left, right, top, bottom };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const visibleCard = '[data-hand-card]:not([hidden])';

function panAt(drag, x) {
  const { panBounds, start, anchor, minPan, maxPan } = drag;
  if (maxPan <= minPan) return clamp(anchor, maxPan, minPan);
  const pivot = clamp(anchor, minPan, maxPan);
  if (x < start.x) {
    const progress = clamp((start.x - x) / (start.x - panBounds.left), 0, 1);
    return pivot + (maxPan - pivot) * progress;
  }
  if (x > start.x) {
    const progress = clamp((x - start.x) / (panBounds.right - start.x), 0, 1);
    return pivot + (minPan - pivot) * progress;
  }
  return pivot;
}

function cardPositions(hand, portrait) {
  return new Map([...hand.querySelectorAll(visibleCard)].map(card => [
    card.dataset.handCard, bounds(card, portrait)
  ]));
}

function cancelReflow(hand) {
  for (const animation of hand.getAnimations({ subtree: true })) {
    if (animation.id === 'hand-reflow') animation.cancel();
  }
}

function animateReflow(hand, previous, portrait, scale, held) {
  if (!hand || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const card of hand.querySelectorAll(visibleCard)) {
    const from = previous.get(card.dataset.handCard);
    if (!from || card === held) continue;
    const to = bounds(card, portrait);
    const x = (from.left - to.left) / scale;
    const y = (from.top - to.top) / scale;
    if (Math.abs(x) < .25 && Math.abs(y) < .25) continue;
    const animation = card.animate([
      { transform: `translate(${x}px, ${y}px)` },
      { transform: 'none' }
    ], { duration: 150, easing: 'ease-out', composite: 'add' });
    animation.id = 'hand-reflow';
  }
}

function horizontalTargets(columns, halfGap) {
  const first = columns[0];
  return [
    { x: first.left - halfGap, column: first.column, newColumn: true, marker: first.element, side: 'left' },
    ...columns.flatMap((stack, index) => {
      const next = columns[index + 1];
      return [
        { x: (stack.left + stack.right) / 2, stack },
        {
          x: next ? (stack.right + next.left) / 2 : stack.right + halfGap,
          column: stack.column + 1, newColumn: true, marker: stack.element, side: 'right'
        }
      ];
    })
  ];
}

function findDrop(drag, x, y) {
  const { targets, source, area, edge } = drag;
  if (y < area.top - edge || y > area.bottom + edge ||
      x < area.left || x > area.right) return null;
  x -= panAt(drag, x);

  const first = targets[0].x;
  const last = targets.at(-1).x;
  if (x < first - (targets[1].x - first) / 2 ||
      x > last + (last - targets.at(-2).x) / 2) return null;

  // Split the distance between each column center and the neighbouring gap center.
  const target = targets.find(({ x: center }, index) =>
    index === targets.length - 1 || x < (center + targets[index + 1].x) / 2);
  const { stack } = target;
  if (!stack) return target;
  if (stack.cards.length >= 4) return null;
  const index = stack.slotBoundaries.findIndex(boundary => y < boundary);
  const slot = index === -1 ? stack.cards.length : index;
  return {
    column: stack.column,
    index: slot + Number(stack.column === source.column && slot >= source.index),
    stack: stack.element, before: stack.cards[slot] ?? stack.element.querySelector('.group-score')
  };
}

function showDrop(drag, drop, previous) {
  const old = drag.drop;
  if (old?.column === drop?.column && old?.index === drop?.index && old?.marker === drop?.marker) {
    if (previous) animateReflow(drag.hand, previous, drag.portrait, drag.scale, drag.held);
    return;
  }

  const movesCards = old?.stack || drop?.stack;
  if (!previous && movesCards) {
    previous = cardPositions(drag.hand, drag.portrait);
    cancelReflow(drag.hand);
  }
  delete old?.marker?.dataset.drop;
  drag.slot.remove();
  drag.drop = drop;
  if (drop?.newColumn) drop.marker.dataset.drop = drop.side;
  else if (drop) drop.stack.insertBefore(drag.slot, drop.before);
  if (previous) animateReflow(drag.hand, previous, drag.portrait, drag.scale, drag.held);
}

export function bindHandDrag(table, { onStart, onDrop, onEnd }) {
  let drag;
  let suppressClick = false;

  table.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    const card = event.target.closest('[data-hand-card]');
    drag = card ? { card, pointer: event.pointerId, startX: event.clientX, startY: event.clientY } : undefined;
    if (drag) onStart();
  });

  table.addEventListener('pointerleave', event => {
    if (drag && !drag.columns) end(event);
  });

  table.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    let previous;
    if (!drag.columns) {
      if (!table.contains(drag.card)) {
        end(event);
        return;
      }
      if (Math.hypot(dx, dy) < 8) return;
      const hand = drag.card.closest('.hand');
      const felt = hand.closest('.felt');
      const portrait = matchMedia('(orientation: portrait)').matches;
      const scale = Number(table.style.getPropertyValue('--table-scale'));
      const start = { x: portrait ? drag.startY : drag.startX, y: portrait ? -drag.startX : drag.startY };
      cancelReflow(hand);
      previous = cardPositions(hand, portrait);
      const from = previous.get(drag.card.dataset.handCard);
      const right = bounds(hand.parentElement, portrait).right;
      const width = parseFloat(getComputedStyle(hand).maxWidth) * scale;
      const panBounds = { left: right - width, right };
      const stacks = [...hand.children];
      const origin = drag.card.parentElement;
      const source = { column: stacks.indexOf(origin), index: [...origin.querySelectorAll(visibleCard)].indexOf(drag.card) };
      for (const stack of stacks) {
        const { left, right } = bounds(stack, portrait);
        stack.style.setProperty('--drag-column-width', `${(right - left) / scale}px`);
      }

      const held = drag.card.cloneNode(true);
      held.classList.add('dragged-card');
      held.setAttribute('aria-hidden', 'true');
      held.tabIndex = -1;
      held.style.width = `${(from.right - from.left) / scale}px`;
      const slot = document.createElement('span');
      slot.className = 'card hand-drop-slot';
      slot.setAttribute('aria-hidden', 'true');

      table.setPointerCapture(event.pointerId);
      felt.classList.add('dragging-hand');
      drag.card.hidden = true;
      origin.hidden = stacks.length > 1 && !origin.querySelector(visibleCard);
      const style = getComputedStyle(hand);
      const height = parseFloat(style.getPropertyValue('--strip-height')) * scale;
      const peek = parseFloat(style.getPropertyValue('--strip-peek')) * scale;
      const fourPeek = parseFloat(style.getPropertyValue('--four-card-peek')) * scale;
      const columns = stacks.map((element, column) => {
        if (element.hidden) return null;
        const rect = bounds(element, portrait);
        const cards = [...element.querySelectorAll(visibleCard)];
        const step = cards.length >= 3 ? fourPeek : peek;
        const top = rect.bottom - height - Math.min(3, cards.length) * step;
        const centers = cards.map((_, i) => top + (i + .5) * step);
        centers.push(rect.bottom - height / 2);
        const slotBoundaries = centers.slice(0, -1).map((center, i) => (center + centers[i + 1]) / 2);
        return { ...rect, element, column, cards, top, slotBoundaries };
      }).filter(Boolean);
      const track = bounds(hand, portrait);
      const gripX = start.x - from.left;
      const originX = track.left + gripX;
      const originY = track.top + start.y - from.top;
      const halfGap = parseFloat(style.columnGap) * scale / 2;
      const nextStack = columns.find(column => column.column > source.column);
      const pivot = origin.hidden
        ? (nextStack ? nextStack.left - halfGap : columns.at(-1).right + halfGap)
        : bounds(origin, portrait).left + gripX;
      Object.assign(drag, {
        hand, felt, held, slot, stacks, origin, columns, portrait, scale, panBounds, start, originX, originY,
        targets: horizontalTargets(columns, halfGap),
        anchor: start.x - pivot,
        maxPan: panBounds.left - columns[0].left,
        minPan: panBounds.right - columns.at(-1).right,
        source,
        area: { ...bounds(felt, portrait), top: Math.min(...columns.map(stack => stack.top)) },
        edge: Math.min(12 * scale, (from.right - from.left) / 3)
      });
      hand.append(held);
      suppressClick = true;
    }

    const { portrait, scale, held, hand, originX, originY } = drag;
    const x = portrait ? event.clientY : event.clientX;
    const y = portrait ? -event.clientX : event.clientY;
    const pan = panAt(drag, x);
    hand.style.setProperty('--hand-pan', `${pan / scale}px`);
    held.style.setProperty('--drag-x', `${(x - pan - originX) / scale}px`);
    held.style.setProperty('--drag-y', `${(y - originY) / scale}px`);
    showDrop(drag, findDrop(drag, x, y), previous);
  });

  function end(event) {
    if (drag?.pointer !== event.pointerId) return;
    const { card, columns, source, drop, portrait, scale, hand, felt, held, slot, stacks, origin } = drag;
    const destination = columns && event.type === 'pointerup'
      ? findDrop(drag, portrait ? event.clientY : event.clientX, portrait ? -event.clientX : event.clientY)
      : null;
    drag = undefined;
    if (columns) {
      const previous = cardPositions(hand, portrait);
      cancelReflow(hand);
      slot.remove();
      held.remove();
      card.hidden = false;
      origin.hidden = false;
      felt.classList.remove('dragging-hand');
      hand.style.removeProperty('--hand-pan');
      for (const stack of stacks) stack.style.removeProperty('--drag-column-width');
      delete drop?.marker?.dataset.drop;
      if (destination) onDrop(source, destination);
      animateReflow(table.querySelector('.hand'), previous, portrait, scale);
    }
    onEnd();
  }

  table.addEventListener('pointerup', end);
  table.addEventListener('pointercancel', end);
  table.addEventListener('lostpointercapture', event => {
    if (event.target === table) end(event);
  });
  table.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
