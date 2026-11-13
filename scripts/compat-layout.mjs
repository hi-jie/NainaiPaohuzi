import screenSizes from 'compat-screen-sizes';

const root = document.documentElement;
const main = document.querySelector('main');
const table = document.querySelector('#table');
const front = document.querySelectorAll('.front-screen');
const profile = document.querySelector('#profile');
const update = document.querySelector('#app-update');
const clamp = (minimum, value, maximum) => Math.max(minimum, Math.min(value, maximum));
const size = (style, name) => parseFloat(style.getPropertyValue(`--${name}`));
function px(element, name, value) {
  const property = `--${name}`;
  const length = `${value}px`;
  if (element.style.getPropertyValue(property) !== length) element.style.setProperty(property, length);
}

function screen(element, width, height) {
  screenSizes(width, height).forEach((value, index) => px(element, `compat-size-${index}`, value));
}

function safeArea() {
  const safe = getComputedStyle(root);
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    px(main, `layout-${edge}`, Math.max(4, size(safe, `safe-${edge}`) || 0));
  }
}

function viewport() {
  const portrait = matchMedia('(orientation: portrait)').matches;
  const { innerWidth: width, innerHeight: height } = window;
  px(root, 'compat-height', height);
  screen(root, portrait ? height : width, portrait ? width : height);
  safeArea();
}

function fitFront(width, height) {
  for (const page of front) screen(page, width, height);
  px(root, 'compat-home-gap', clamp(18, width * .028, 30));
  px(profile, 'compat-profile-avatar', clamp(62, height * .22, 128));
  profile.classList.toggle('compact-profile', height - 2 * clamp(12, height * .05, 30) <= 218);
}

function fitHand() {
  const hand = table.querySelector('.hand:not(.opening-row)');
  if (!hand || !table.classList.contains('wide')) return;
  const style = getComputedStyle(hand);
  const get = name => size(style, name);
  const tableWidth = get('table-width');
  const inset = get('seat-inset');
  const offset = get('avatar-size') + 7;
  const card = get('seat-card-width');
  const step = get('seat-back-step');
  const meldGap = get('meld-gap');
  const discardGap = get('discard-gap');
  const meldWidth = count => count * (card + meldGap) - meldGap;
  const discardWidth = count => count * (card + discardGap) - discardGap;
  const start = offset + Math.max((get('hand-backs') + 1) * step, meldWidth(get('hand-melds'))) + 8;
  const own = clamp(0, discardWidth(get('hand-discards')) + 8, get('own-discard-width') + 8);
  const symmetric = !!hand.closest('.six-hu.many-seats');
  const right = symmetric ? offset + Math.max((get('right-backs') + 1) * step,
    meldWidth(get('right-melds')), Math.min(get('right-seat-cards-width'), discardWidth(get('right-discards')))) + 8 : 0;
  const width = tableWidth - 2 * inset - (symmetric ? 2 * Math.max(start, right, own) : start + own);
  const columns = Math.max(1, get('hand-columns'));
  const gaps = columns - 1;
  const gap = clamp(1, (width - columns * get('strip-width')) / Math.max(1, gaps), 8);
  hand.style.maxWidth = `${width}px`;
  px(hand, 'compat-hand-gap', gap);
  px(hand, 'strip-font', Math.min(33.6, (width - gaps * gap) / columns - 3));
  if (!symmetric) {
    const position = clamp(start + inset - tableWidth / 2, -hand.offsetWidth / 2,
      tableWidth / 2 - inset - own - hand.offsetWidth);
    hand.style.transform = `translateX(${position}px)`;
  }
}

function syncTable() {
  main.classList.toggle('table-visible', !table.hidden);
  main.classList.toggle('settlement-visible', !table.hidden && !!table.querySelector('.settlement:not([hidden])'));
}

function syncHand(hand) {
  for (const stack of hand.querySelectorAll('.hand-stack')) {
    stack.classList.toggle('four-cards', stack.querySelectorAll('.card:not([hidden])').length >= 4);
    stack.classList.toggle('reordering', !!stack.querySelector('.card[hidden], .hand-drop-slot'));
  }
  fitHand();
}

viewport();
window.addEventListener('resize', viewport);
if (!CSS.supports('selector(:focus-visible)')) {
  root.classList.add('legacy-focus');
  window.addEventListener('keydown', event => { if (event.key === 'Tab') root.classList.add('keyboard-focus'); });
  window.addEventListener('pointerdown', () => root.classList.remove('keyboard-focus'));
}
new MutationObserver(safeArea).observe(root, { attributes: true, attributeFilter: ['style'] });
// Replacing the table for a new round also removes the previous settlement.
new MutationObserver(syncTable).observe(table, { childList: true });
new MutationObserver(() => update.parentElement.classList.toggle('without-update', update.hidden))
  .observe(update, { attributes: true, attributeFilter: ['hidden'] });
update.parentElement.classList.toggle('without-update', update.hidden);
window.paohuziCompatLayout = { fitFront, fitHand, syncTable, syncHand };
