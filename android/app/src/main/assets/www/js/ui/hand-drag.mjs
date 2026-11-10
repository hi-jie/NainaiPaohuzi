function bounds(element, portrait) {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  return portrait ? { left: top, right: bottom, top: -right, bottom: -left } : { left, right, top, bottom };
}

const visibleCard = '[data-hand-card]:not([hidden])';
const reflowItems = `${visibleCard}, .group-score`;

function panAt(drag, x) {
  const { panLimits, panRate, start, anchor } = drag;
  return anchor + (start.x - Math.min(panLimits.right, Math.max(panLimits.left, x))) * panRate;
}

function reflowKey(item) {
  return item.dataset.handCard ?? `score:${Array.from(item.parentElement.querySelectorAll('[data-hand-card]'),
    card => card.dataset.handCard).join(',')}`;
}

function handPositions(hand, portrait) {
  return new Map([...hand.querySelectorAll(reflowItems)].map(item => [
    reflowKey(item), bounds(item, portrait)
  ]));
}

function cancelReflow(hand) {
  for (const animation of hand.getAnimations({ subtree: true })) {
    if (animation.id === 'hand-reflow') animation.cancel();
  }
}

function animateReflow(hand, previous, portrait, scale, held) {
  if (!hand || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const item of hand.querySelectorAll(reflowItems)) {
    const from = previous.get(reflowKey(item));
    if (!from || item === held) continue;
    const to = bounds(item, portrait);
    const x = (from.left - to.left) / scale;
    const y = (from.top - to.top) / scale;
    if (Math.abs(x) < .25 && Math.abs(y) < .25) continue;
    const animation = item.animate([
      { transform: `translate(${x}px, ${y}px)` },
      { transform: 'none' }
    ], { duration: 150, easing: 'ease-out', composite: 'add' });
    animation.id = 'hand-reflow';
  }
}

function horizontalTargets(columns, edgeCenter) {
  const first = columns[0];
  return [
    { x: first.left - edgeCenter, column: first.column, newColumn: true, marker: first.element, side: 'left' },
    ...columns.flatMap((stack, index) => {
      const next = columns[index + 1];
      return [
        { x: (stack.left + stack.right) / 2, stack },
        {
          x: next ? (stack.right + next.left) / 2 : stack.right + edgeCenter,
          column: stack.column + 1, newColumn: true, marker: stack.element, side: 'right'
        }
      ];
    })
  ];
}

function targetAt(drag, x) {
  const { targets, edgeReach } = drag;
  x -= panAt(drag, x);

  const first = targets[0].x;
  const last = targets.at(-1).x;
  if (x < first - edgeReach || x > last + edgeReach) return null;

  // Give an existing column 55% of the distance to either neighbouring gap center.
  return targets.find(({ x: center, stack }, index) => {
    if (index === targets.length - 1) return true;
    const share = stack ? .55 : .45;
    return x < center + (targets[index + 1].x - center) * share;
  });
}

function findDrop(drag, x, y) {
  const { source, area, edge } = drag;
  if (y < area.top - edge || y > area.bottom + edge ||
      x < area.left || x > area.right) return null;
  const target = targetAt(drag, x);
  if (!target) return null;
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
    previous = handPositions(drag.hand, drag.portrait);
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
      previous = handPositions(hand, portrait);
      const from = previous.get(drag.card.dataset.handCard);
      const stacks = [...hand.children];
      const origin = drag.card.parentElement;
      const originBounds = bounds(origin, portrait);
      const sourceAxis = (originBounds.left + originBounds.right) / 2;
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
      const frameWidth = parseFloat(style.getPropertyValue('--edge-frame-width')) * scale;
      const frameGap = parseFloat(style.getPropertyValue('--edge-frame-gap')) * scale;
      const frameInset = parseFloat(style.getPropertyValue('--edge-frame-inset')) * scale;
      const edgeReach = frameWidth / 2 + frameInset;
      const targets = horizontalTargets(columns, frameWidth / 2 + frameGap);
      const expandedAxis = targets.find(target => origin.hidden
        ? target.newColumn && target.column >= source.column
        : target.stack?.column === source.column).x;
      const area = { ...bounds(felt, portrait), top: Math.min(...columns.map(stack => stack.top)) };
      const rightMargin = area.right - bounds(hand.parentElement, portrait).right;
      const frameClearance = rightMargin + frameWidth / 2;
      const leftLimit = area.left + frameClearance;
      const rightLimit = area.right - frameClearance;
      const leftTravel = start.x - leftLimit;
      const rightTravel = rightLimit - start.x;
      const first = targets[0].x;
      const last = targets.at(-1).x;
      let anchor = sourceAxis - expandedAxis;
      // A grab past a frame limit has no outward travel to bring that frame into view.
      if (leftTravel <= 0) anchor = Math.max(anchor, leftLimit - first);
      if (rightTravel <= 0) anchor = Math.min(anchor, rightLimit - last);
      const leftDistance = Math.max(0, start.x - (first + anchor));
      const rightDistance = Math.max(0, last + anchor - start.x);
      // Pointer travel and the opposite hand motion together close the distance to a drop frame.
      const panRate = Math.max(0,
        leftTravel > 0 ? leftDistance / leftTravel - 1 : 0,
        rightTravel > 0 ? rightDistance / rightTravel - 1 : 0);
      const panLimits = {
        left: start.x - leftDistance / (1 + panRate),
        right: start.x + rightDistance / (1 + panRate)
      };
      Object.assign(drag, {
        hand, felt, held, slot, stacks, origin, columns, portrait, scale, start, originX, originY,
        targets, edgeReach, anchor, panRate, panLimits, pan: anchor, source, area,
        edge: Math.min(12 * scale, (from.right - from.left) / 3)
      });
      drag.region = targetAt(drag, start.x);
      hand.append(held);
      suppressClick = true;
    }

    const { portrait, scale, held, hand, originX, originY } = drag;
    const x = portrait ? event.clientY : event.clientX;
    const y = portrait ? -event.clientX : event.clientY;
    const region = targetAt(drag, x);
    if (region && region !== drag.region) {
      const center = drag.start.x + (region.x + drag.anchor - drag.start.x) / (1 + drag.panRate);
      const nextPan = panAt(drag, center);
      if (nextPan !== drag.pan) {
        previous ??= handPositions(hand, portrait);
        cancelReflow(hand);
        drag.pan = nextPan;
      }
      drag.region = region;
    }
    const { pan } = drag;
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
      const previous = handPositions(hand, portrait);
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
