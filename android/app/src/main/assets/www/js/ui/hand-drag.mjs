function bounds(element, portrait) {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  return portrait ? { left: top, right: bottom, top: -right, bottom: -left } : { left, right, top, bottom };
}

const visibleCard = '[data-hand-card]:not([hidden])';
const reflowItems = `${visibleCard}, .group-score, .hand-drop-slot`;

function reflowKey(item) {
  if (item.classList.contains('hand-drop-slot')) return 'drop-slot';
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

function findDrop(drag, x, y) {
  const { source, columns, area } = drag;
  if (y < area.cancel || y > area.bottom) return null;
  const midpoint = column => (column.left + column.right) / 2;
  if (y < area.top || x < columns[0].left || x > columns.at(-1).right) {
    const next = columns.find(column => x < midpoint(column));
    return { column: next?.column ?? columns.length, newColumn: true, before: next?.element ?? drag.held };
  }
  const stack = columns.find((column, index) => index === columns.length - 1 ||
    x < (column.right + columns[index + 1].left) / 2);
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
  if (old?.column === drop?.column && old?.index === drop?.index && old?.newColumn === drop?.newColumn) {
    if (previous) animateReflow(drag.hand, previous, drag.portrait, drag.scale, drag.held);
    return;
  }

  if (!previous) {
    previous = handPositions(drag.hand, drag.portrait);
    cancelReflow(drag.hand);
  }
  drag.slot.remove();
  drag.drop = drop;
  drag.slot.classList.toggle('card', !drop?.newColumn);
  drag.slot.classList.toggle('new-column-slot', !!drop?.newColumn);
  drag.origin.hidden = !!drop?.newColumn && drag.emptySource;
  if (drop?.newColumn) drag.hand.insertBefore(drag.slot, drop.before);
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
      const source = { column: stacks.indexOf(origin), index: [...origin.querySelectorAll(visibleCard)].indexOf(drag.card) };
      const handTop = bounds(hand, portrait).top;

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
      const emptySource = !origin.querySelector(visibleCard);
      const style = getComputedStyle(hand);
      const height = parseFloat(style.getPropertyValue('--strip-height')) * scale;
      const peek = parseFloat(style.getPropertyValue('--strip-peek')) * scale;
      const fourPeek = parseFloat(style.getPropertyValue('--four-card-peek')) * scale;
      const columns = stacks.map((element, column) => {
        const rect = bounds(element, portrait);
        const cards = [...element.querySelectorAll(visibleCard)];
        const step = cards.length >= 3 ? fourPeek : peek;
        const top = rect.bottom - height - Math.min(3, cards.length) * step;
        const centers = cards.map((_, i) => top + (i + .5) * step);
        centers.push(rect.bottom - height / 2);
        const slotBoundaries = centers.slice(0, -1).map((center, i) => (center + centers[i + 1]) / 2);
        return { ...rect, element, column, cards, top, slotBoundaries };
      });
      const feltBounds = bounds(felt, portrait);
      const insertionTop = handTop - 24 * scale;
      const area = { top: insertionTop, cancel: (feltBounds.top + insertionTop) / 2, bottom: feltBounds.bottom };
      const guides = document.createElement('div');
      guides.className = 'hand-drag-guides';
      guides.setAttribute('aria-hidden', 'true');
      guides.style.setProperty('--cancel-height', `${(area.cancel - feltBounds.top) / scale}px`);
      guides.style.setProperty('--new-column-height', `${(area.top - area.cancel) / scale}px`);
      guides.innerHTML = '<span>取消</span><span>新增列</span>';
      felt.append(guides);
      Object.assign(drag, {
        hand, felt, held, slot, guides, origin, emptySource, columns, portrait, scale, source, area,
        gripX: start.x - from.left, gripY: start.y - from.top
      });
      hand.append(held);
      suppressClick = true;
    }

    const { portrait, scale, held, hand, gripX, gripY } = drag;
    const x = portrait ? event.clientY : event.clientX;
    const y = portrait ? -event.clientX : event.clientY;
    showDrop(drag, findDrop(drag, x, y), previous);
    const track = bounds(hand, portrait);
    held.style.setProperty('--drag-x', `${(x - track.left - gripX) / scale}px`);
    held.style.setProperty('--drag-y', `${(y - track.top - gripY) / scale}px`);
  });

  function end(event) {
    if (drag?.pointer !== event.pointerId) return;
    const { card, columns, source, portrait, scale, hand, felt, held, slot, guides, origin } = drag;
    const destination = columns && event.type === 'pointerup'
      ? findDrop(drag, portrait ? event.clientY : event.clientX, portrait ? -event.clientX : event.clientY)
      : null;
    drag = undefined;
    if (columns) {
      const previous = handPositions(hand, portrait);
      cancelReflow(hand);
      slot.remove();
      held.remove();
      guides.remove();
      card.hidden = false;
      origin.hidden = false;
      felt.classList.remove('dragging-hand');
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
