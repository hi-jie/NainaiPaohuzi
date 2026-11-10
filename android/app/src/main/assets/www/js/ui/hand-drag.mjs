function bounds(element, portrait) {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  return portrait ? { left: top, right: bottom, top: -right, bottom: -left } : { left, right, top, bottom };
}

function findDrop(drag, x, y) {
  const { columns, source, area, edge, limit } = drag;
  if (y < area.top - edge || y > area.bottom + edge ||
      x < columns[0].left - edge * 2 || x > columns.at(-1).right + edge * 2) return null;

  const column = columns.findIndex(({ right }) => x <= right + edge);
  const stack = columns[column];
  if (!stack || x < stack.left + edge || x > stack.right - edge) {
    if (columns.length >= limit && columns[source.column].cards.length > 1) return null;
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
    if (!drag.columns) {
      if (!table.contains(drag.card)) {
        end(event);
        return;
      }
      if (Math.hypot(dx, dy) < 8) return;
      const hand = drag.card.closest('.hand');
      const portrait = matchMedia('(orientation: portrait)').matches;
      const scale = Number(table.style.getPropertyValue('--table-scale'));
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
      const seatCards = hand.parentElement.querySelector('.seat-cards');
      const autoHand = table.querySelector('.auto-hand');
      const handEnd = autoHand ? autoHand.offsetLeft - hand.parentElement.offsetLeft - 8 : hand.parentElement.clientWidth;
      const available = handEnd - seatCards.offsetLeft - seatCards.offsetWidth;
      const gap = parseFloat(getComputedStyle(hand).columnGap);
      const width = parseFloat(getComputedStyle(hand).getPropertyValue('--strip-width'));
      Object.assign(drag, {
        columns, portrait, scale, source: { column, index }, area: bounds(hand, portrait),
        edge: Math.min(12 * scale, (columns[column].right - columns[column].left) / 3),
        limit: Math.max(columns.length, Math.floor((available + gap) / (width + gap + 3)))
      });
      table.setPointerCapture(event.pointerId);
      drag.card.classList.add('dragged-card');
      drag.card.parentElement.classList.add('dragged-stack');
      suppressClick = true;
    }

    const { portrait, scale, card } = drag;
    card.style.setProperty('--drag-x', `${(portrait ? dy : dx) / scale}px`);
    card.style.setProperty('--drag-y', `${(portrait ? -dx : dy) / scale}px`);
    delete drag.drop?.marker.dataset.drop;
    drag.drop = findDrop(drag, portrait ? event.clientY : event.clientX, portrait ? -event.clientX : event.clientY);
    if (drag.drop) drag.drop.marker.dataset.drop = drag.drop.side;
  });

  function end(event) {
    if (drag?.pointer !== event.pointerId) return;
    const { card, columns, source, drop, portrait } = drag;
    const destination = columns && event.type === 'pointerup'
      ? findDrop(drag, portrait ? event.clientY : event.clientX, portrait ? -event.clientX : event.clientY)
      : null;
    drag = undefined;
    if (columns) {
      card.classList.remove('dragged-card');
      card.parentElement.classList.remove('dragged-stack');
      card.style.removeProperty('--drag-x');
      card.style.removeProperty('--drag-y');
      delete drop?.marker.dataset.drop;
      if (destination) onDrop(source, destination);
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
