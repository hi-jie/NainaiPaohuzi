import { cardName, huxi, isRed, takeCards } from '../rules/cards.mjs';
import { nextSeat } from '../rules/actions.mjs?v=141';
import { createHandLayout, eatPreviewIds, handColumnGroup } from './hand.mjs?v=229';
import { tablemates } from '../data/tablemates.mjs?v=179';

const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => htmlEntities[character]);

function seatIdentity(round, seat, profile) {
  if (seat === 0) {
    const name = escapeHtml(profile?.nickname || '我');
    const image = /^data:image\/(webp|png|jpeg);base64,/i.test(profile?.avatar) ? escapeHtml(profile.avatar) : null;
    return { name, image };
  }
  const id = round.tablemates?.[seat - 1];
  const name = escapeHtml(tablemates[id] ?? '对家');
  const image = Number.isInteger(id) ? `./media/avatars/tablemates/${String(id + 1).padStart(2, '0')}.webp` : null;
  return { name, image };
}

function navButton(command, icon, label) {
  return `<button class="icon-button" data-command="${command}" aria-label="${label}"${command === 'home' ? '' : ' aria-haspopup="dialog"'}>
    <svg class="nav-icon" aria-hidden="true"><use href="#icon-${icon}"/></svg></button>`;
}

function avatar(seat, { name, image }) {
  if (image) {
    return `<img class="avatar avatar-${seat}" src="${image}" alt="${name}" draggable="false">`;
  }
  return `<span class="avatar avatar-${seat}" role="img" aria-label="${name}"></span>`;
}

function tile(card, hidden = false, selection, hinted = false, handId) {
  const classes = `card${hidden ? ' back' : isRed(card) ? ' red' : ''}${hinted ? ' hinted' : ''}`;
  const handAttribute = handId === undefined ? '' : ` data-hand-card="${handId}"`;
  if (selection !== undefined) {
    return `<button class="${classes}"${handAttribute} data-select-card="${selection}" aria-pressed="false" aria-label="选择${cardName(card)}">${cardName(card)}</button>`;
  }
  return `<span class="${classes}"${handAttribute}>${hidden ? '◆' : cardName(card)}</span>`;
}

function meld({ type, cards, offeredCard }, concealed = false, reveal = false) {
  const displayCards = offeredCard === undefined ? cards : [...takeCards(cards, [offeredCard]), offeredCard];
  return `<span class="meld${concealed && reveal ? ' reveal-meld' : ''}" data-meld="${type}" data-cards="${cards.join(' ')}">${displayCards.map((card, index) => tile(card, concealed && !reveal && index > 0)).join('')}</span>`;
}

function revealSlots(cards) {
  return cards.map(card => `<span class="reveal-slot">${tile(card)}</span>`).join('');
}

function playerHand(round, layout, canDiscard, response, canDrag) {
  const mahjong = round.rules.mode === 'mahjong';
  const matching = response?.type === '吃' ? [] : [...(response?.cards ?? [])];
  const cardView = ({ id, card }) => {
    const action = canDiscard ? round.options.findIndex(option => option.card === card) : -1;
    const match = matching.indexOf(card);
    if (match !== -1) matching.splice(match, 1);
    return tile(card, false, action === -1 ? undefined : action, match !== -1, canDrag ? id : undefined);
  };
  return layout.map(column => {
    const group = handColumnGroup(column, round.rules.patterns, mahjong);
    const score = group && !mahjong
      ? `<strong class="group-score"><span class="sr-only">胡息 </span>${huxi(group)}</strong>` : '';
    return `<div class="hand-stack${group ? '' : ' loose'}">${column.map(cardView).join('')}${score}</div>`;
  }).join('');
}

function centerOffer(round) {
  if (round.rules.mode === 'mahjong') return round.offer;
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
  if (round.rules.mode === 'mahjong') return discards;
  const offer = centerOffer(round);
  return offer?.source === seat && (offer.parked || offer.kind === 'discard')
    ? discards.slice(0, -1) : discards;
}

function totalHuxi(groups) {
  return groups.reduce((sum, group) => sum + huxi(group), 0);
}

function seatView(round, seat, identity, activeSeat, event, response, openingStage, actions = '', handLayout) {
  const { hand, groups: playedGroups } = round.players[seat];
  const { name } = identity;
  const mahjong = round.rules.mode === 'mahjong';
  const discards = tableDiscards(round, seat);
  const showdown = round.phase === 'finished';
  const winner = showdown && round.result.winner === seat;
  const groups = winner ? round.result.hu.groups : playedGroups;
  const spread = openingStage === 'deal' || openingStage === 'reveal';
  const arranging = openingStage === 'sort';
  const showHand = !openingStage || arranging;
  const backs = showHand || (mahjong && spread && seat !== 0) ? hand.length : spread && seat !== 0 ? round.rules.dealt : 0;
  const active = seat === activeSeat;
  const yourDiscard = !openingStage && seat === 0 && round.seat === seat && round.phase === 'discard';
  const layout = seat === 0 && showHand && !showdown ? handLayout ?? createHandLayout(hand, round.rules.patterns, mahjong) : null;
  const rightSeat = layout && round.rules.mode === 'six' && round.players.length === 4 ? round.players[2] : null;
  const rightCards = rightSeat
    ? `;--right-backs:${rightSeat.hand.length};--right-melds:${rightSeat.groups.length};--right-discards:${tableDiscards(round, 2).length}`
    : '';
  const discardArea = `<div class="discarded" role="group" aria-label="${name}的弃牌，${discards.length}张">
    ${discards.map((card, index) => seat === 0
      ? `<span class="discard-slot" style="z-index:${discards.length - index}">${tile(card)}</span>` : tile(card)).join('')}
  </div>`;
  return `<section class="seat seat-${seat}${active ? ' active' : ''}${yourDiscard ? ' choosing-card' : ''}${winner ? ' winner' : ''}"${active ? ' aria-current="true"' : ''}>
    <div class="seat-heading">
      ${avatar(seat, identity)}
      <span class="seat-name" title="${name}">${name}</span>
      <span class="dealer" ${round.dealer === seat ? '' : 'inert aria-hidden="true"'}>庄</span>
      ${showHand && !mahjong ? `<strong class="seat-score">${totalHuxi(playedGroups)}胡息</strong>` : ''}
    </div>
    ${event?.seat === seat && !['摸', '出'].includes(event.type) ? `<span class="callout" aria-hidden="true">${event.type}</span>` : ''}
    <div class="seat-cards">
      <div class="groups">${showHand ? groups.map(group => meld(group, seat !== 0 && ['偎', '提'].includes(group.type), showdown)).join('') : ''}</div>
      ${showdown
        ? (winner ? '' : `<div class="revealed-hand" aria-label="${name}的手牌">${revealSlots(hand)}</div>`)
        : `<div class="seat-backs" aria-hidden="true">${'<span></span>'.repeat(backs)}</div>`}
      ${seat !== 0 ? discardArea : ''}
    </div>
    ${seat === 0 ? `<div class="seat-cards own-discards">${discardArea}</div>` : ''}
    ${actions ? `<div class="actions hand-actions">${actions}</div>` : ''}
    ${seat === 0 && spread ? openingHand(round.openingHand, openingStage === 'reveal') : ''}
    ${layout ? `<div class="hand" aria-label="我的手牌"
      style="--hand-columns:${layout.length};--hand-backs:${backs};--hand-melds:${groups.length};--hand-discards:${discards.length}${rightCards}">${playerHand(
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

function actionButtons(options, mahjong) {
  const firstEat = options.findIndex(action => action.type === '吃');
  return options.map(({ type }, index) => {
    if (type === '出') return '';
    if (type === '吃' && !mahjong) {
      return index === firstEat ? '<button data-command="choose-eat" aria-haspopup="dialog">吃</button>' : '';
    }
    const label = shortActionLabel(type);
    const style = type === '过' ? 'pass' : 'primary guided';
    const winStyle = type === '胡' ? ' win-action' : '';
    return `<button class="${style}${winStyle}" data-action="${index}">${label}</button>`;
  }).reverse().join('');
}

export function renderEatChoices(options, offeredCard) {
  const choices = options.map((action, index) => {
    if (action.type !== '吃') return '';
    const label = `接${cardName(offeredCard)}，${eatGroupNames(action).join('、')}`;
    const offeredIndex = action.groups[0].indexOf(offeredCard);
    const groups = action.groups.map((cards, groupIndex) => `<span class="eat-group">
      ${cards.map((card, cardIndex) => groupIndex === 0 && cardIndex === offeredIndex
        ? `<span class="eat-source">${tile(card)}</span>` : tile(card)).join('')}
    </span>`);
    const compact = groups.length > 3;
    const rows = compact ? [groups.slice(0, 2), groups.slice(2)] : [groups];
    return `<button class="eat-choice${compact ? ' eat-choice-compact' : ''}" data-action="${index}" aria-pressed="false" aria-label="${label}">
      ${rows.map(row => `<span class="eat-row" aria-hidden="true">${row.join('')}</span>`).join('')}
    </button>`;
  }).join('');
  return `<div class="eat-choices">${choices}</div>`;
}

export function previewEat(table, action, layout, patterns) {
  const ids = action ? eatPreviewIds(layout, patterns, [...action.cards, ...action.groups.slice(1).flat()]) : new Set();
  for (const card of table.querySelectorAll('.hand [data-hand-card]')) {
    card.classList.toggle('eat-preview', ids.has(Number(card.dataset.handCard)));
  }
}

function resultView(round, score, profile) {
  const { winner, hu, names: bonuses, tun, delta, kind } = round.result;
  const identities = delta.map((_, seat) => seatIdentity(round, seat, profile));
  const details = winner === null ? '' : `
    <div class="groups">${hu.groups.map(group => meld(group)).join('')}</div>
    <p>${kind ? (kind === 'self' ? '自摸' : '接炮') : `${hu.huxi} 胡息 · ${tun} 囤 · ${bonuses.map(([name, multiple]) => `${name} ×${multiple}`).join('、')}`}</p>`;
  return `<div class="settlement"><section class="panel result" aria-live="polite">
    <small>本局结算</small>
    <h2 class="avatar-label">${winner === null ? '黄庄' : `${avatar(winner, identities[winner])}${identities[winner].name}胡牌`}</h2>
    ${details}
    <div class="deltas">${delta.map((value, seat) => `<div>${avatar(seat, identities[seat])}<span class="result-player-name" title="${identities[seat].name}">${identities[seat].name}</span>
      <strong class="${value < 0 ? 'loss' : ''}">${value > 0 ? '+' : ''}${value}</strong></div>`).join('')}</div>
    <p>累计积分 ${score}</p>
    <div class="actions"><button class="primary" data-command="again">再来一局</button>
    <button data-command="review-round">查看牌局</button>
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

export function renderTable(round, score, event, openingStage = '', handLayout = null, profile) {
  const { phase, seat, options } = round;
  const mahjong = round.rules.mode === 'mahjong';
  const showdown = phase === 'finished';
  const offer = centerOffer(round);
  const response = seat === 0 && phase === 'response' ? options[0] : null;
  const handHint = seat === 0 && phase === 'opening-ti' ? options[0] : response;
  const arrowSeat = offer && ['response', 'claim'].includes(phase) ? offer.source : seat;
  const source = offer?.source ?? event?.seat ?? round.dealer;
  const visibleCard = offer?.card ?? round.opening;
  const revealTile = !mahjong && ['reveal', 'sort'].includes(openingStage) && !round.hasOpeningTi;
  const flatDeck = !openingStage || ['reveal', 'sort'].includes(openingStage);
  const playing = !openingStage && phase !== 'finished';
  const activeSeat = playing ? arrowSeat : null;
  const myTurn = playing && seat === 0;
  let actions = '';
  if (openingStage) actions = '<button data-command="skip-opening">跳过动画</button>';
  else if (myTurn && phase === 'discard') {
    actions = '<button class="primary" data-command="discard" disabled>出牌</button>';
    if (mahjong) actions += actionButtons(options, true);
  } else if (myTurn && !options[0].forced) actions = actionButtons(options, mahjong);
  const lastLabel = offer?.kind === 'draw' ? '摸牌' : offer?.kind === 'discard' ? '出牌' : '庄家亮张';
  return `<div class="felt${mahjong ? ' mahjong' : ''}${round.rules.mode === 'six' ? ' six-hu' : ''}${round.players.length > 3 ? ' many-seats' : ''}${round.players.length === 5 ? ' five-seats' : ''}${openingStage ? ' opening' : ''}${showdown ? ' showdown' : ''}"${openingStage ? ` data-stage="${openingStage}"` : ''}>
    <div class="table-hud">
      ${phase !== 'finished' ? navButton('leave', 'back', '返回首页') + navButton('pause', 'settings', '设置') : ''}
      ${showdown ? '<button data-command="return-to-result" hidden>返回结算</button>' : ''}
      ${playing && handLayout ? '<button data-command="auto-hand">自动理牌</button>' : ''}
      <div class="table-score"><span>${round.rules.name}</span><span>积分 ${score}</span></div>
    </div>
    ${round.players.slice(1).map((_, index) => {
      const other = index + 1;
      return seatView(round, other, seatIdentity(round, other), activeSeat, event, null, openingStage);
    }).join('')}
    <div class="center">
      ${showdown && round.deck.length
        ? `<div class="revealed-deck" role="group" aria-label="牌墩">${revealSlots([...round.deck].reverse())}</div>` : ''}
      <div class="play-area">
        ${showdown ? '' : `<div class="deck${flatDeck && round.deck.length > 1 ? ' stacked' : ''}">
          <span class="card back deck-tile" aria-hidden="true">${openingPile(openingStage)}</span>
          ${!openingStage ? `<span class="deck-count" aria-label="牌墩剩余 ${round.deck.length} 张">${round.deck.length}</span>` : ''}
          ${playing ? `<span class="turn-arrow to-${activeSeat}" data-seat="${activeSeat}" aria-hidden="true"></span>` : ''}
        </div>`}
        <div class="last-play from-${source}">
          <div class="landing">${revealTile && openingStage === 'reveal' ? '<i class="opening-back"></i>' : ''}
            ${offer || revealTile ? tile(visibleCard, false, undefined, response !== null || showdown) : ''}
          </div>
          ${offer && !showdown ? `<span>${lastLabel}</span>` : ''}
        </div>
      </div>
    </div>
    ${seatView(round, 0, seatIdentity(round, 0, profile), activeSeat, event, handHint, openingStage, actions, handLayout)}
    </div>`;
}

export function animateTurnArrow(arrow, previousSeat) {
  if (!arrow || previousSeat === undefined || previousSeat === arrow.dataset.seat ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const angles = [90, 180, 0, arrow.closest('.five-seats') ? 315 : 270, 225];
  const start = angles[previousSeat];
  const sweep = (start - angles[arrow.dataset.seat] + 360) % 360;
  const frames = [start, start - sweep].map(angle => ({
    transform: `translate(-50%, -50%) rotate(${angle}deg) translateX(var(--orbit-radius))`
  }));
  arrow.animate(frames, { duration: 380, easing: 'ease-in-out' });
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

export function showFinishedTable(table, round, score, event, profile) {
  const backs = round.players.map((_, seat) => Array.from(table.querySelectorAll(`.seat-${seat} .seat-backs span`),
    card => card.getBoundingClientRect()));
  table.innerHTML = renderTable(round, score - round.result.delta[0], event, '', null, profile);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    backs.forEach((positions, seat) => {
      table.querySelectorAll(`.seat-${seat} .reveal-slot`).forEach((slot, index) => {
        const from = positions[index] ?? positions.at(-1);
        if (from) slideFrom(table, slot, from, 420, .62);
      });
    });
  }
  if (round.rules.mode === 'mahjong') return;
  const patterns = round.rules.patterns;
  const totals = round.players.map(({ hand, groups }, seat) => {
    if (seat === round.result.winner) return round.result.hu.huxi;
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

export function showOpeningFrame(table, round, score, stage, profile) {
  if (stage === 'sort') {
    animateHandSort(table, () => { table.innerHTML = renderTable(round, score, null, stage, null, profile); }, true);
    return;
  }
  table.innerHTML = renderTable(round, score, null, stage, null, profile);
  const deck = table.querySelector('.deck-tile').getBoundingClientRect();
  if (stage === 'dealer') {
    const badge = table.querySelector(`.seat-${round.dealer} .dealer`);
    slideFrom(table, badge, deck, 550, 1.6);
  } else if (stage === 'deal') {
    const destinations = [
      table.querySelectorAll('.opening-card'),
      ...round.players.slice(1).map((_, index) => table.querySelectorAll(`.seat-${index + 1} .seat-backs span`))
    ];
    const positions = destinations.map(cards => Array.from(cards, card => card.getBoundingClientRect()));
    const seats = destinations.length;
    const portrait = matchMedia('(orientation: portrait)').matches;
    let seat = round.dealer;
    const total = positions.reduce((sum, cards) => sum + cards.length, 0);
    const dealDelays = [];
    for (let i = 0; i < total; i++, seat = nextSeat(seat, seats)) {
      const delay = i * 37;
      dealDelays.push(delay);
      const index = Math.floor(i / seats);
      const card = destinations[seat][index];
      const position = positions[seat][index];
      const [x, y] = tableOffset(table, deck, position);
      const widthScale = deck.width / position.width;
      const heightScale = deck.height / position.height;
      const scale = portrait ? [heightScale, widthScale] : [widthScale, heightScale];
      const origin = `translate(${x}px, ${y}px) scale(${scale.join(', ')})`;
      card.animate([
        { transform: origin, opacity: 0 },
        { transform: origin, opacity: 1, offset: .05 },
        { transform: 'none', opacity: 1 }
      ], { duration: 320, delay, fill: 'both', easing: 'ease-out' });
    }
    return dealDelays;
  }
}

export function showRoundResult(table, round, score, profile) {
  table.querySelector('.winner .callout')?.remove();
  table.querySelector('.table-score span:last-child').textContent = `积分 ${score}`;
  table.querySelector('.felt').inert = true;
  table.insertAdjacentHTML('beforeend', resultView(round, score, profile));
  table.querySelector('[data-command="review-round"]').focus({ preventScroll: true });
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
    const card = table.querySelector(`.seat-${seat} .groups`).children[index].lastElementChild;
    return { offer, meld: index, from: (flying ?? card).getBoundingClientRect() };
  }
}

function animateTransfer(table, card, destination, from, effect = 'move') {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const frame = table.getBoundingClientRect();
  const portrait = matchMedia('(orientation: portrait)').matches;
  const local = rect => portrait
    ? { x: rect.top - frame.top, y: frame.right - rect.right, width: rect.height, height: rect.width }
    : { x: rect.left - frame.left, y: rect.top - frame.top, width: rect.width, height: rect.height };
  const deck = local(table.querySelector('.landing').getBoundingClientRect());
  const start = local(from);
  const end = local(destination.getBoundingClientRect());
  const ghost = document.createElement('span');
  const concealed = effect === 'draw';
  ghost.className = `card flying-card${concealed ? ' back' : isRed(card) ? ' red' : ''}`;
  ghost.setAttribute('aria-hidden', 'true');
  if (!concealed) ghost.textContent = cardName(card);
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
  ghost.animate(frames, { duration: 220, fill: 'both', easing: 'ease-in-out' }).onfinish = () => {
    destination.style.visibility = '';
    ghost.remove();
  };
}

export function animateAction(table, round, event, motion, action) {
  const seatView = seat => table.querySelector(`.seat-${seat}`);
  const discard = seat => [...seatView(seat).querySelectorAll('.discarded .card')].at(-1);
  if (round.rules.mode === 'mahjong' && action?.type === '摸' && motion) {
    animateTransfer(table, motion.offer.card, discard(motion.offer.source), motion.from, 'discard');
  }
  if (round.rules.mode === 'mahjong' && ['吃', '摸'].includes(event?.type)) {
    const seat = seatView(event.seat);
    const destination = event.seat === 0
      ? [...seat.querySelectorAll('.hand .card')].findLast(card => card.textContent === cardName(event.card))
      : seat.querySelector('.seat-backs').lastElementChild;
    const from = event.type === '摸' ? table.querySelector('.deck-tile').getBoundingClientRect() : motion.from;
    animateTransfer(table, event.card, destination, from, event.type === '摸' ? 'draw' : 'move');
    return;
  }
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
    const destination = seatView(seat).querySelector('.groups').children[index].lastElementChild;
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
