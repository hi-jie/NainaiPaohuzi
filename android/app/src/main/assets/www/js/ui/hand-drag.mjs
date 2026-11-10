function bounds(element, portrait) {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  return portrait ? { left: top, right: bottom, top: -right, bottom: -left } : { left, right, top, bottom };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function panAt(drag, x) {
  const { viewport, start, anchor, minPan, maxPan } = drag;
  if (maxPan <= minPan) return clamp(anchor, maxPan, minPan);
  const pivot = clamp(anchor, minPan, maxPan);
  if (x < start.x) {
    const progress = clamp((start.x - x) / (start.x - viewport.left), 0, 1);
    return pivot + (maxPan - pivot) * progress;
  }
  if (x > start.x) {
    const progress = clamp((x - start.x) / (viewport.right - start.x), 0, 1);
    return pivot + (minPan - pivot) * progress;
  }
  return pivot;
}

function cardPositions(hand, portrait) {
  return new Map([...hand.querySelectorAll('[data-hand-card]')].map(card => [
    card.dataset.handCard, bounds(card, portrait)
  ]));
}

function animateReflow(hand, previous, portrait, scale, held) {
  if (!hand || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const card of hand.querySelectorAll('[data-hand-card]')) {
    const from = previous.get(card.dataset.handCard);
    if (!from || card === held) continue;
    const to = bounds(card, portrait);
    const x = (from.left - to.left) / scale;
    const y = (from.top - to.top) / scale;
    const animation = card.animate([
      { transform: `translate(${x}px, ${y}px)` },
      { transform: 'none' }
    ], { duration: 150, easing: 'ease-out', composite: 'add' });
    animation.id = 'hand-reflow';
  }
}

function findDrop(drag, x, y) {
  const { columns, source, area, viewport, edge } = drag;
  if (y < area.top - edge || y > area.bottom + edge ||
      x < viewport.left || x > viewport.right) return null;
  x -= panAt(drag, x);

  const column = columns.findIndex(({ right }) => x <= right + edge);
  const stack = columns[column];
  if (!stack || x < stack.left + edge || x > stack.right - edge) {
    const after = !stack || x > stack.right - edge;
    const index = stack ? column : columns.length - 1;
    return {
      column: index + Number(after), newColumn: true,
      marker: columns[index].element, side: after ? 'right' : 'left'
    };
  }

  if (column !== source.column && stack.cards.length >= 4) return null;
  const index = stack.cards.findIndex(({ middle }) => y < middle);
  const after = index === -1;
  return {
    column, index: after ? stack.cards.length : index,
    marker: (after ? stack.cards.at(-1) : stack.cards[index]).element,
    side: after ? 'bottom' : 'top'
  };
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
      for (const animation of hand.getAnimations({ subtree: true })) {
        if (animation.id === 'hand-reflow') animation.cancel();
      }
      previous = cardPositions(hand, portrait);
      const from = previous.get(drag.card.dataset.handCard);
      for (const column of hand.children) {
        const { left, right } = bounds(column, portrait);
        column.style.setProperty('--drag-column-width', `${(right - left) / scale}px`);
      }

      felt.classList.add('dragging-hand');
      const columns = [...hand.children].map(element => {
        const rect = bounds(element, portrait);
        const cards = [...element.querySelectorAll('[data-hand-card]')].map(card => ({
          ...bounds(card, portrait), element: card
        }));
        return {
          ...rect, element,
          cards: cards.map(({ top, bottom, element }, index) => ({
            element, middle: (top + (cards[index + 1]?.top ?? bottom)) / 2
          }))
        };
      });
      const column = columns.findIndex(({ element }) => element === drag.card.parentElement);
      const index = columns[column].cards.findIndex(({ element }) => element === drag.card);
      const spread = bounds(drag.card, portrait);
      const originX = spread.left + start.x - from.left;
      const originY = spread.top + start.y - from.top;
      const viewport = bounds(felt, portrait);
      Object.assign(drag, {
        hand, felt, columns, portrait, scale, viewport, start, originX, originY,
        anchor: start.x - originX,
        maxPan: viewport.left + 14 * scale - columns[0].left,
        minPan: viewport.right - 14 * scale - columns.at(-1).right,
        source: { column, index },
        area: { top: Math.min(...columns.map(stack => stack.top)), bottom: viewport.bottom },
        edge: Math.min(12 * scale, (columns[column].right - columns[column].left) / 3)
      });
      table.setPointerCapture(event.pointerId);
      drag.card.classList.add('dragged-card');
      drag.card.parentElement.classList.add('dragged-stack');
      suppressClick = true;
    }

    const { portrait, scale, card, hand, originX, originY } = drag;
    const x = portrait ? event.clientY : event.clientX;
    const y = portrait ? -event.clientX : event.clientY;
    const pan = panAt(drag, x);
    hand.style.setProperty('--hand-pan', `${pan / scale}px`);
    card.style.setProperty('--drag-x', `${(x - pan - originX) / scale}px`);
    card.style.setProperty('--drag-y', `${(y - originY) / scale}px`);
    if (previous) animateReflow(hand, previous, portrait, scale, card);
    delete drag.drop?.marker.dataset.drop;
    drag.drop = findDrop(drag, x, y);
    if (drag.drop) drag.drop.marker.dataset.drop = drag.drop.side;
  });

  function end(event) {
    if (drag?.pointer !== event.pointerId) return;
    const { card, columns, source, drop, portrait, scale, hand, felt } = drag;
    const destination = columns && event.type === 'pointerup'
      ? findDrop(drag, portrait ? event.clientY : event.clientX, portrait ? -event.clientX : event.clientY)
      : null;
    drag = undefined;
    if (columns) {
      const previous = cardPositions(hand, portrait);
      for (const animation of hand.getAnimations({ subtree: true })) {
        if (animation.id === 'hand-reflow') animation.cancel();
      }
      felt.classList.remove('dragging-hand');
      hand.style.removeProperty('--hand-pan');
      for (const column of columns) column.element.style.removeProperty('--drag-column-width');
      card.classList.remove('dragged-card');
      card.parentElement.classList.remove('dragged-stack');
      card.style.removeProperty('--drag-x');
      card.style.removeProperty('--drag-y');
      delete drop?.marker.dataset.drop;
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
