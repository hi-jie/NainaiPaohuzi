import { cardName, huxi, isRed } from '../rules/cards.mjs';
import { nextSeat } from '../rules/actions.mjs?v=66';
import { createHandLayout, handColumnGroup } from './hand.mjs?v=67';

const names = ['我', '电脑一', '电脑二'];

function navButton(command, icon, label) {
  return `<button class="icon-button" data-command="${command}" aria-label="${label}"${command === 'home' ? '' : ' aria-haspopup="dialog"'}>
    <svg class="nav-icon" aria-hidden="true"><use href="#icon-${icon}"/></svg></button>`;
}

function avatar(seat) {
  return `<span class="avatar avatar-${seat}" role="img" aria-label="${names[seat]}"></span>`;
}

function tile(card, hidden = false, selection, hinted = false, handId) {
  const classes = `card${hidden ? ' back' : isRed(card) ? ' red' : ''}${hinted ? ' hinted' : ''}`;
  const handAttribute = handId === undefined ? '' : ` data-hand-card="${handId}"`;
  if (selection !== undefined) {
    return `<button class="${classes}"${handAttribute} data-select-card="${selection}" aria-pressed="false" aria-label="选择${cardName(card)}">${cardName(card)}</button>`;
  }
  return `<span class="${classes}"${handAttribute}>${hidden ? '◆' : cardName(card)}</span>`;
}

function meld(group, concealed = false, reveal = false) {
  return `<span class="meld${concealed && reveal ? ' reveal-meld' : ''}" data-meld="${group.type}" data-cards="${group.cards.join(' ')}">${group.cards.map((card, index) => tile(card, concealed && !reveal && index > 0)).join('')}</span>`;
}

function revealedHand(hand, seat) {
  return `<div class="revealed-hand" aria-label="${names[seat]}的手牌">${hand.map(card =>
    `<span class="reveal-slot">${tile(card)}</span>`).join('')}</div>`;
}

function playerHand(round, layout, canDiscard, response, canDrag) {
  const matching = response?.type === '吃' ? [] : [...(response?.cards ?? [])];
  const cardView = ({ id, card }) => {
    const action = canDiscard ? round.options.findIndex(option => option.card === card) : -1;
    const match = matching.indexOf(card);
    if (match !== -1) matching.splice(match, 1);
    return tile(card, false, action === -1 ? undefined : action, match !== -1, canDrag ? id : undefined);
  };
  return layout.map(column => {
    const group = handColumnGroup(column, round.rules.patterns);
    const points = group ? huxi(group) : 0;
    const score = points > 0 ? `<strong class="group-score"><span class="sr-only">胡息 </span>${points}</strong>` : '';
    return `<div class="hand-stack${group ? '' : ' loose'}">${column.map(cardView).join('')}${score}</div>`;
  }).join('');
}

function centerOffer(round) {
  if (round.phase === 'response') return round.offer;
  if (round.phase !== 'draw') return null;
  const last = round.events.at(-1);
  if (last?.type === '摸' || last?.type === '出') {
    return { source: last.seat, card: last.card, kind: last.type === '摸' ? 'draw' : 'discard', parked: true };
  }
  return null;
}

function tableDiscards(round, seat) {
  const { discards } = round.players[seat];
  const offer = centerOffer(round);
  return offer?.source === seat && (offer.parked || offer.kind === 'discard')
    ? discards.slice(0, -1) : discards;
}

function totalHuxi(groups) {
  return groups.reduce((sum, group) => sum + huxi(group), 0);
}

function seatView(round, seat, event, response, openingStage, actions = '', handLayout) {
  const { hand, groups } = round.players[seat];
  const discards = tableDiscards(round, seat);
  const showdown = event?.type === '胡';
  const spread = openingStage === 'deal' || openingStage === 'reveal';
  const arranging = openingStage === 'sort';
  const showHand = !openingStage || arranging;
  const backs = showHand ? hand.length : spread && seat !== 0 ? round.rules.dealt : 0;
  const active = !openingStage && round.seat === seat && round.phase !== 'finished';
  const yourDiscard = seat === 0 && active && round.phase === 'discard';
  const total = totalHuxi(groups);
  const layout = seat === 0 && showHand && !showdown ? handLayout ?? createHandLayout(hand, round.rules.patterns) : null;
  return `<section class="seat seat-${seat}${active ? ' active' : ''}${yourDiscard ? ' choosing-card' : ''}"${active ? ' aria-current="true"' : ''}>
    <div class="seat-heading">
      ${avatar(seat)}
      <span class="dealer" ${round.dealer === seat ? '' : 'inert aria-hidden="true"'}>庄</span>
      ${showHand ? `<strong class="seat-score">${total}胡息</strong>` : ''}
    </div>
    ${event?.seat === seat && !['摸', '出'].includes(event.type) ? `<span class="callout" aria-hidden="true">${event.type}</span>` : ''}
    <div class="seat-cards">
      <div class="groups">${showHand ? groups.map(group => meld(group, seat !== 0 && ['偎', '提'].includes(group.type), showdown)).join('') : ''}</div>
      ${showdown ? revealedHand(hand, seat) : `<div class="seat-backs" aria-hidden="true">${'<span></span>'.repeat(backs)}</div>`}
      <button class="discarded" data-history="${seat}" data-view="discards" ${discards.length ? '' : 'disabled'} ${showdown ? 'inert' : ''} aria-label="${names[seat]}的弃牌，${discards.length}张">
        ${discards.map(card => tile(card)).join('')}
      </button>
    </div>
    ${actions ? `<div class="actions hand-actions">${actions}</div>` : ''}
    ${seat === 0 && spread ? openingHand(round.openingHand, openingStage === 'reveal') : ''}
    ${layout ? `<div class="hand" aria-label="我的手牌"
      style="--hand-columns:${layout.length};--hand-backs:${backs};--hand-melds:${groups.length};--hand-discards:${discards.length}">${playerHand(
      round, layout, yourDiscard, response, !openingStage && round.phase !== 'finished'
    )}</div>` : ''}
  </section>`;
}

function shortActionLabel(type) {
  return ['摸', '出'].includes(type) ? `${type}牌` : type;
}

function eatGroupNames(action) {
  return action.groups.map(group => group.map(cardName).join(''));
}

function actionButtons(options) {
  const firstEat = options.findIndex(action => action.type === '吃');
  return options.map(({ type }, index) => {
    if (type === '吃') {
      return index === firstEat ? '<button data-command="choose-eat" aria-haspopup="dialog">吃</button>' : '';
    }
    const label = shortActionLabel(type);
    return `<button class="${type === '过' ? 'pass' : 'primary guided'}" data-action="${index}">${label}</button>`;
  }).reverse().join('');
}

export function renderEatChoices(options, offeredCard) {
  const choices = options.map((action, index) => {
    if (action.type !== '吃') return '';
    const label = `接${cardName(offeredCard)}，${eatGroupNames(action).join('、')}`;
    const offeredIndex = action.groups[0].indexOf(offeredCard);
    return `<button class="eat-choice" data-action="${index}" aria-pressed="false" aria-label="${label}">
      ${action.groups.map((cards, groupIndex) => `<span class="eat-group" aria-hidden="true">
        ${cards.map((card, cardIndex) => groupIndex === 0 && cardIndex === offeredIndex
          ? `<span class="eat-source">${tile(card)}</span>` : tile(card)).join('')}
      </span>`).join('')}
    </button>`;
  }).join('');
  return `<div class="eat-choices">${choices}</div>`;
}

export function previewEat(table, action) {
  const needed = action ? [...action.cards, ...action.groups.slice(1).flat()].map(cardName) : [];
  const loose = table.querySelectorAll('.hand-stack.loose .card');
  const grouped = table.querySelectorAll('.hand-stack:not(.loose) .card');
  for (const card of [...loose, ...grouped]) {
    const index = needed.indexOf(card.textContent);
    card.classList.toggle('eat-preview', index !== -1);
    if (index !== -1) needed.splice(index, 1);
  }
}

export function renderHistory(round, seat, view) {
  const player = round.players[seat];
  const discards = tableDiscards(round, seat);
  const content = view === 'groups'
    ? `<div class="groups">${player.groups.map(group => meld(group, seat !== 0 && ['偎', '提'].includes(group.type))).join('')}</div>`
    : `<p class="history-count">共 ${discards.length} 张</p>
    <div class="history-cards" role="region" aria-label="按出现顺序排列的弃牌" tabindex="0">
      ${discards.map(card => tile(card)).join('')}
    </div>`;
  return `<h2 class="avatar-label">${avatar(seat)}${view === 'groups' ? '落地牌' : '弃牌'}</h2>${content}
    <form method="dialog"><button class="primary" autofocus>关闭</button></form>`;
}

function resultView({ winner, hu, names: bonuses, tun, delta }, score) {
  const details = winner === null ? '' : `
    <div class="groups">${hu.groups.map(group => meld(group)).join('')}</div>
    <p>${hu.huxi} 胡息 · ${tun} 囤 · ${bonuses.map(([name, multiple]) => `${name} ×${multiple}`).join('、')}</p>`;
  return `<div class="settlement"><section class="panel result" aria-live="polite">
    <small>本局结算</small>
    <h2 class="avatar-label">${winner === null ? '黄庄' : `${avatar(winner)}胡牌`}</h2>
    ${details}
    <div class="deltas">${delta.map((value, seat) => `<div>${avatar(seat)}<strong class="${value < 0 ? 'loss' : ''}">${value > 0 ? '+' : ''}${value}</strong></div>`).join('')}</div>
    <p>累计积分 ${score}</p>
    <div class="actions"><button class="primary" data-command="again">再来一局</button>
    ${navButton('home', 'back', '返回首页')}</div>
  </section></div>`;
}

export const openingStages = [
  { name: 'dealer', duration: 900 },
  { name: 'shuffle', duration: 750 },
  { name: 'cut', duration: 700 },
  { name: 'deal', duration: 2640 },
  { name: 'reveal', duration: 800 },
  { name: 'sort', duration: 670 }
];

function openingHand(hand, reveal) {
  return `<div class="hand opening-row" aria-label="我的手牌">${hand.map((card, index) =>
    `<div class="opening-card" style="--flip-delay:${index * 9}ms">
      <i class="opening-back" aria-hidden="true"></i>${reveal ? tile(card) : ''}
    </div>`).join('')}</div>`;
}

function openingPile(stage) {
  if (!['shuffle', 'cut', 'deal'].includes(stage)) return '';
  const count = stage === 'shuffle' ? 4 : 2;
  return `<span class="opening-pile" aria-hidden="true">${Array.from({ length: count }, (_, index) =>
    `<i class="opening-back opening-stack" style="--index:${index}"></i>`).join('')}</span>`;
}

export function renderTable(round, score, event, openingStage = '', handLayout = null, winningMeld) {
  const { phase, seat, options } = round;
  const showdown = event?.type === '胡';
  const offer = showdown && winningMeld === undefined ? round.offer : centerOffer(round);
  const response = seat === 0 && phase === 'response' ? options[0] : null;
  const handHint = seat === 0 && phase === 'opening-ti' ? options[0] : response;
  const arrowSeat = phase === 'response' ? offer.source : seat;
  const source = offer?.source ?? event?.seat ?? round.dealer;
  const visibleCard = offer?.card ?? round.opening;
  const revealTile = ['reveal', 'sort'].includes(openingStage) && !round.hasOpeningTi;
  const playing = !openingStage && phase !== 'finished';
  const myTurn = playing && seat === 0;
  let actions = '';
  if (openingStage) actions = '<button data-command="skip-opening">跳过动画</button>';
  else if (myTurn && phase === 'discard') actions = '<button class="primary" data-command="discard" disabled>出牌</button>';
  else if (myTurn && !options[0].forced) actions = actionButtons(options);
  const lastLabel = offer?.kind === 'draw' ? '摸牌' : offer?.kind === 'discard' ? '出牌' : '庄家亮张';
  return `<div class="felt${openingStage ? ' opening' : ''}${showdown ? ' showdown' : ''}"${openingStage ? ` data-stage="${openingStage}"` : ''}>
    <div class="table-hud">
      ${phase !== 'finished' ? navButton('leave', 'back', '返回首页') + navButton('pause', 'settings', '设置') : ''}
      ${playing && handLayout ? '<button data-command="auto-hand">自动理牌</button>' : ''}
      <span>${round.rules.name}</span><span>积分 ${score}</span>
    </div>
    ${seatView(round, 1, event, null, openingStage)}${seatView(round, 2, event, null, openingStage)}
    <div class="center">
      <div class="play-area">
        <div class="deck${!openingStage && round.deck.length > 1 ? ' stacked' : ''}">
          <span class="card back deck-tile" aria-hidden="true">字${openingPile(openingStage)}</span>
          ${!openingStage ? `<span class="deck-count">余 ${round.deck.length} 张</span>` : ''}
          ${playing ? `<span class="turn-arrow to-${arrowSeat}" aria-hidden="true"></span>` : ''}
        </div>
        <div class="last-play from-${source}">
          <div class="landing">${revealTile && openingStage === 'reveal' ? '<i class="opening-back"></i>' : ''}
            ${offer || revealTile ? tile(visibleCard, false, undefined, response !== null || showdown) : ''}
          </div>
          ${offer && !showdown ? `<span>${lastLabel}</span>` : ''}
        </div>
      </div>
    </div>
    ${seatView(round, 0, event, handHint, openingStage, actions, handLayout)}
    </div>
    ${phase === 'finished' && !showdown ? resultView(round.result, score) : ''}`;
}

function tableOffset(table, from, to) {
  const scale = Number(table.style.getPropertyValue('--table-scale'));
  const x = (from.left + (from.width - to.width) / 2 - to.left) / scale;
  const y = (from.top + (from.height - to.height) / 2 - to.top) / scale;
  return matchMedia('(orientation: portrait)').matches ? [y, -x] : [x, y];
}

function slideFrom(table, element, from, duration, scale) {
  const [x, y] = tableOffset(table, from, element.getBoundingClientRect());
  element.animate([
    { transform: `translate(${x}px, ${y}px) scale(${scale})` },
    { transform: 'none' }
  ], { duration, fill: 'backwards', easing: 'cubic-bezier(.22,.6,.28,1)' });
}

export function showWinningTable(table, round, score, event, winningMeld) {
  const backs = round.players.map((_, seat) => Array.from(table.querySelectorAll(`.seat-${seat} .seat-backs span`),
    card => card.getBoundingClientRect()));
  table.innerHTML = renderTable(round, score - round.result.delta[0], event, '', null, winningMeld);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    backs.forEach((positions, seat) => {
      table.querySelectorAll(`.seat-${seat} .reveal-slot`).forEach((slot, index) => {
        slideFrom(table, slot, positions[index], 420, .62);
      });
    });
  }
  const patterns = round.rules.patterns;
  const totals = round.players.map(({ hand, groups }, seat) => {
    if (seat === event.seat) return round.result.hu.huxi;
    const handGroups = createHandLayout(hand, patterns).map(column => handColumnGroup(column, patterns)).filter(Boolean);
    return totalHuxi(groups) + totalHuxi(handGroups);
  });
  const scores = totals.map((_, seat) => table.querySelector(`.seat-${seat} .seat-score`));
  const updateScores = () => scores.forEach((label, seat) => { label.textContent = `${totals[seat]}胡息`; });
  const animations = [...table.querySelectorAll('.seat-cards')].flatMap(cards => cards.getAnimations({ subtree: true }));
  if (animations.length) Promise.allSettled(animations.map(animation => animation.finished)).then(updateScores);
  else updateScores();
}

export function animateHandSort(table, render, opening = false) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    render();
    return;
  }
  const previousCards = new Map();
  for (const card of table.querySelectorAll(opening ? '.opening-row .card' : '.seat-0 .hand .card')) {
    const label = card.textContent;
    if (!previousCards.has(label)) previousCards.set(label, []);
    previousCards.get(label).push(card.getBoundingClientRect());
  }
  render();
  const destination = opening ? '.seat-0 .hand .card, .seat-0 .groups .card' : '.seat-0 .hand .card';
  for (const card of table.querySelectorAll(destination)) {
    const from = previousCards.get(card.textContent)?.shift();
    if (from) slideFrom(table, card, from, 560, opening ? .76 : 1);
  }
}

export function showOpeningFrame(table, round, score, stage) {
  if (stage === 'sort') {
    animateHandSort(table, () => { table.innerHTML = renderTable(round, score, null, stage); }, true);
    return;
  }
  table.innerHTML = renderTable(round, score, null, stage);
  const deck = table.querySelector('.deck-tile').getBoundingClientRect();
  if (stage === 'dealer') {
    const badge = table.querySelector(`.seat-${round.dealer} .dealer`);
    slideFrom(table, badge, deck, 550, 1.6);
  } else if (stage === 'deal') {
    const destinations = [
      table.querySelectorAll('.opening-card'),
      table.querySelectorAll('.seat-1 .seat-backs span'),
      table.querySelectorAll('.seat-2 .seat-backs span')
    ];
    const positions = destinations.map(cards => Array.from(cards, card => card.getBoundingClientRect()));
    let seat = round.dealer;
    for (let i = 0; i < round.rules.dealt * 3; i++, seat = nextSeat(seat)) {
      const index = Math.floor(i / 3);
      const card = destinations[seat][index];
      const [x, y] = tableOffset(table, deck, positions[seat][index]);
      const origin = `translate(${x}px, ${y}px) scale(${seat === 0 ? 1.55 : 2.6})`;
      card.animate([
        { transform: origin, opacity: 0 },
        { transform: origin, opacity: 1, offset: .05 },
        { transform: 'none', opacity: 1 }
      ], { duration: 320, delay: i * 37, fill: 'both', easing: 'ease-out' });
    }
  }
}

function meldCard(area, groups, index, card) {
  return area.children[index].children[groups[index].cards.indexOf(card)];
}

export function showWinningResult(table, round, score, event, winningMeld) {
  const { card, seat } = event;
  const { groups } = round.players[seat];
  const winning = round.result.hu.groups;
  const source = winningMeld === undefined ? table.querySelector('.landing .card')
    : meldCard(table.querySelector(`.seat-${seat} .groups`), groups, winningMeld, card);
  const from = source.getBoundingClientRect();
  source.style.visibility = 'hidden';
  table.insertAdjacentHTML('beforeend', resultView(round.result, score));
  const index = winningMeld ?? winning.findIndex((group, i) => i >= groups.length && group.cards.includes(card));
  const destination = meldCard(table.querySelector('.settlement .groups'), winning, index, card);
  animateTransfer(table, card, destination, from, 'win');
}

export function captureOfferMotion(table, round) {
  const { phase, seat } = round;
  const center = centerOffer(round);
  if (center) return { offer: center, from: table.querySelector('.landing .card').getBoundingClientRect() };
  if (phase === 'after-meld') {
    const { offer } = round;
    const flying = table.querySelector('.flying-card');
    const { type } = round.events.at(-1);
    const { groups } = round.players[seat];
    const index = groups.findIndex(group => group.type === type && group.cards[0] === offer.card);
    const card = meldCard(table.querySelector(`.seat-${seat} .groups`), groups, index, offer.card);
    return { offer, meld: index, from: (flying ?? card).getBoundingClientRect() };
  }
}

function animateTransfer(table, card, destination, from, effect = 'move') {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const win = effect === 'win';
  const frame = table.getBoundingClientRect();
  const portrait = matchMedia('(orientation: portrait)').matches;
  const local = rect => portrait
    ? { x: rect.top - frame.top, y: frame.right - rect.right, width: rect.height, height: rect.width }
    : { x: rect.left - frame.left, y: rect.top - frame.top, width: rect.width, height: rect.height };
  const deck = local(table.querySelector('.landing').getBoundingClientRect());
  const start = local(from);
  const end = local(destination.getBoundingClientRect());
  const ghost = document.createElement('span');
  ghost.className = `card flying-card${isRed(card) ? ' red' : ''}${win ? ' winning' : ''}`;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = cardName(card);
  Object.assign(ghost.style, {
    left: `${start.x}px`, top: `${start.y}px`, width: `${deck.width}px`, height: `${deck.height}px`,
    fontSize: `${28 * Number(table.style.getPropertyValue('--table-scale'))}px`
  });
  const transform = ({ x, y, width, height }) =>
    `translate(${x - start.x}px, ${y - start.y}px) scale(${width / deck.width}, ${height / deck.height})`;
  const origin = transform(start);
  const target = transform(end);
  const frames = effect === 'discard' ? [
    { transform: origin, opacity: 1 },
    { transform: `${origin} scale(.85)`, opacity: 0, offset: .42 },
    { transform: `${target} scale(.85)`, opacity: 0, offset: .43 },
    { transform: `${target} scale(1.08)`, opacity: 1, offset: .8 },
    { transform: target, opacity: 1 }
  ] : [{ transform: origin }, { transform: target }];
  destination.style.visibility = 'hidden';
  table.append(ghost);
  ghost.animate(frames,
    { duration: win ? 300 : 220, fill: 'both', easing: 'ease-in-out' }).onfinish = () => {
    destination.style.visibility = '';
    ghost.remove();
  };
}

export function animateAction(table, round, event, motion, action) {
  const seatView = seat => table.querySelector(`.seat-${seat}`);
  const discard = seat => seatView(seat).querySelector('.discarded').lastElementChild;
  if (motion?.offer.parked) {
    const { offer: { card, source }, from } = motion;
    animateTransfer(table, card, discard(source), from, 'discard');
  }
  if (event?.type === '摸' || event?.type === '出') {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const origin = event.type === '摸' ? table.querySelector('.deck-tile') : seatView(event.seat);
    const card = table.querySelector('.landing .card');
    const [x, y] = tableOffset(table, origin.getBoundingClientRect(), card.getBoundingClientRect());
    card.animate([
      { transform: `translate(${x}px, ${y}px) scale(.72)`, opacity: .3 },
      { transform: 'scale(1.08)', opacity: 1, offset: .78 },
      { transform: 'scale(1)', opacity: 1 }
    ], { duration: 220, easing: 'cubic-bezier(.2,.72,.28,1)' });
  } else if (event?.fromHand) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const seat = seatView(event.seat);
    const origin = event.seat === 0 ? seat.querySelector('.hand') : seat.querySelector('.avatar');
    slideFrom(table, seat.querySelector('.groups').lastElementChild, origin.getBoundingClientRect(), 220, .72);
  } else if (event) {
    const { card, seat } = event;
    const { groups } = round.players[seat];
    const index = action.previous >= 0 ? action.previous : groups.length - (action.groups?.length ?? 1);
    const destination = meldCard(seatView(seat).querySelector('.groups'), groups, index, card);
    animateTransfer(table, card, destination, motion.from);
  } else if (motion?.offer.kind === 'opening' && motion.meld === undefined && round.phase !== 'response' && round.phase !== 'opening-ti') {
    const { offer: { source, card }, from } = motion;
    const seat = seatView(source);
    const destination = source === 0
      ? [...seat.querySelectorAll('.hand .card')].findLast(tile => tile.textContent === cardName(card))
      : seat.querySelector('.seat-backs').lastElementChild;
    animateTransfer(table, card, destination, from);
  }
}
