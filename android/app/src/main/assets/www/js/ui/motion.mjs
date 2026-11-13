const compatibility = typeof __PAOHUZI_COMPAT__ !== 'undefined';
const running = new WeakMap();

export function animate(element, frames, options) {
  if (!compatibility) return element.animate(frames, options);
  const { composite, ...timing } = options;
  const style = getComputedStyle(element);
  const keyframes = frames.map(frame => {
    if (!frame.transform) return frame;
    let transform = frame.transform.replace(/var\((--[\w-]+)\)/g,
      (_, name) => style.getPropertyValue(name).trim());
    if (composite === 'add' && style.transform !== 'none') {
      transform = transform === 'none' ? style.transform : `${style.transform} ${transform}`;
    }
    return { ...frame, transform };
  });
  const animation = element.animate(keyframes, timing);
  const done = new Promise(resolve => {
    animation.addEventListener('finish', resolve, { once: true });
    animation.addEventListener('cancel', resolve, { once: true });
  });
  const animations = running.get(element) || new Set();
  running.set(element, animations);
  const entry = { animation, done };
  animations.add(entry);
  done.then(() => animations.delete(entry));
  return animation;
}

function tracked(container) {
  return [...container.querySelectorAll('*')].flatMap(element => [...(running.get(element) || [])]);
}

export function cancelHandReflow(hand) {
  const animations = compatibility
    ? tracked(hand).map(({ animation }) => animation)
    : hand.getAnimations({ subtree: true });
  for (const animation of animations) {
    if (animation.id === 'hand-reflow') animation.cancel();
  }
}

export function afterSeatAnimations(container, callback) {
  const seats = [...container.querySelectorAll('.seat-cards')];
  let waits;
  if (compatibility) {
    waits = seats.flatMap(seat => tracked(seat).map(({ done }) => done));
    for (const seat of seats) {
      for (const card of seat.querySelectorAll('.reveal-slot .card, .reveal-meld .card + .card')) {
        if (getComputedStyle(card).animationName !== 'showdown-flip') continue;
        waits.push(new Promise(resolve => {
          const finish = event => {
            if (event.animationName !== 'showdown-flip') return;
            card.removeEventListener('animationend', finish);
            card.removeEventListener('animationcancel', finish);
            clearTimeout(timeout);
            resolve();
          };
          const timeout = setTimeout(resolve, 500);
          card.addEventListener('animationend', finish);
          card.addEventListener('animationcancel', finish);
        }));
      }
    }
  } else {
    waits = seats.flatMap(seat => seat.getAnimations({ subtree: true }).map(animation => animation.finished));
  }
  if (waits.length) Promise.allSettled(waits).then(callback);
  else callback();
}
