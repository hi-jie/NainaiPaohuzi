import { cardName, huxi, isRed } from '../rules/cards.mjs';
import { arrangeHand } from './hand.mjs?v=58';

const names = ['我', '电脑一', '电脑二'];

function navButton(command, icon, label) {
  return `<button class="icon-button" data-command="${command}" aria-label="${label}"${command === 'home' ? '' : ' aria-haspopup="dialog"'}>
    <svg class="nav-icon" aria-hidden="true"><use href="#icon-${icon}"/></svg></button>`;
}

function avatar(seat) {
  return `<span class="avatar avatar-${seat}" role="img" aria-label="${names[seat]}"></span>`;
}

function tile(card, hidden = false, selection, hinted = false) {
  const classes = `card${hidden ? ' back' : isRed(card) ? ' red' : ''}${hinted ? ' hinted' : ''}`;
  if (selection !== undefined) {
    return `<button class="${classes}" data-select-card="${selection}" aria-pressed="false" aria-label="选择${cardName(card)}">${cardName(card)}</button>`;
  }
  return `<span class="${classes}">${hidden ? '◆' : cardName(card)}</span>`;
}

function meld(group, hide = false) {
  return `<span class="meld" data-meld="${group.type}" data-cards="${group.cards.join(' ')}">${group.cards.map((card, index) => tile(card, hide && index > 0)).join('')}</span>`;
}

function playerHand(round, hand, canDiscard, response) {
  const matching = response?.type === '吃' ? [] : [...(response?.cards ?? [])];
  const cardView = card => {
    const action = canDiscard ? round.options.findIndex(option => option.card === card) : -1;
    const match = matching.indexOf(card);
    if (match !== -1) matching.splice(match, 1);
    return tile(card, false, action === -1 ? undefined : action, match !== -1);
  };
  const { stacks, loose } = arrangeHand(hand, round.rules.patterns);
  const stackView = cards => {
    const type = cards.length === 4 ? '提' : cards.length === 2 ? '对' : cards.every(card => card === cards[0]) ? '坎' : '吃';
    const points = huxi({ type, cards });
    const score = points > 0 ? `<strong class="group-score"><span class="sr-only">胡息 </span>${points}</strong>` : '';
    return `<div class="hand-stack">${cards.map(cardView).join('')}${score}</div>`;
  };
  return stacks.map(stackView).join('') + loose.map(cards =>
    `<div class="hand-stack loose">${cards.map(cardView).join('')}</div>`).join('');
}

function seatView(round, seat, event, response, openingStage) {
  const { hand, groups, discards } = round.players[seat];
  const spread = openingStage === 'deal' || openingStage === 'reveal';
  const arranging = openingStage === 'sort';
  const showHand = !openingStage || arranging;
  const backs = showHand ? hand.length : spread && seat !== 0 ? round.rules.dealt : 0;
  const active = !openingStage && round.seat === seat && round.phase !== 'finished';
  const yourDiscard = seat === 0 && active && round.phase === 'discard';
  const total = groups.reduce((sum, group) => sum + huxi(group), 0);
  return `<section class="seat seat-${seat}${active ? ' active' : ''}${yourDiscard ? ' choosing-card' : ''}"${active ? ' aria-current="true"' : ''}>
    <div class="seat-heading">
      ${avatar(seat)}
      <span class="dealer" ${round.dealer === seat ? '' : 'inert aria-hidden="true"'}>庄</span>
      ${showHand ? `<strong class="seat-score">${total}胡息</strong>` : ''}
    </div>
    ${event?.seat === seat && !['摸', '出'].includes(event.type) ? `<span class="callout" aria-hidden="true">${event.type}</span>` : ''}
    <div class="seat-cards">
      <div class="groups">${showHand ? groups.map(group => meld(group, seat !== 0 && ['偎', '提'].includes(group.type))).join('') : ''}</div>
      <div class="seat-backs" aria-hidden="true">${'<span></span>'.repeat(backs)}</div>
      <button class="discarded" data-history="${seat}" data-view="discards" ${discards.length ? '' : 'disabled'} aria-label="${names[seat]}的弃牌，${discards.length}张">
        ${discards.map(card => tile(card)).join('')}
      </button>
    </div>
    ${seat === 0 && spread ? openingHand(round.openingHand, openingStage === 'reveal') : ''}
    ${seat === 0 && showHand ? `<div class="hand" aria-label="我的手牌">${playerHand(round, hand, yourDiscard, response)}</div>` : ''}
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
  return options.map(({ type, card }, index) => {
    if (type === '吃') {
      return index === firstEat ? '<button data-command="choose-eat" aria-haspopup="dialog">吃</button>' : '';
    }
    const label = type === '提' && card !== undefined ? `提 ${cardName(card)}` : shortActionLabel(type);
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
  return `<header class="eat-header">
    <h2 id="eat-title">选择吃法</h2>
    <form method="dialog"><button class="eat-close" aria-label="关闭吃法" autofocus>×</button></form>
  </header><div class="eat-choices">${choices}</div>`;
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
  const content = view === 'groups'
    ? `<div class="groups">${player.groups.map(group => meld(group, seat !== 0 && ['偎', '提'].includes(group.type))).join('')}</div>`
    : `<p class="history-count">共 ${player.discards.length} 张</p>
    <div class="history-cards" role="region" aria-label="按出现顺序排列的弃牌" tabindex="0">
      ${player.discards.map(card => tile(card)).join('')}
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

export function renderTable(round, score, event, openingStage = '') {
  const { phase, seat, options, events } = round;
  const response = seat === 0 && phase === 'response' ? options[0] : null;
  const handHint = seat === 0 && phase === 'opening-ti' ? { cards: options.flatMap(action => action.cards) } : response;
  const arrowSeat = phase === 'response' ? round.offer.source : seat;
  const last = events.findLast(({ type }) => type === '出' || type === '摸');
  const source = last?.seat ?? round.dealer;
  const visibleCard = last?.card ?? round.opening;
  const revealTile = ['reveal', 'sort'].includes(openingStage) && !round.hasOpeningTi;
  const showLastPlay = !openingStage && phase !== 'opening-ti';
  const playing = !openingStage && phase !== 'finished';
  const myTurn = playing && seat === 0;
  let actions = '';
  if (myTurn && phase === 'discard') actions = '<button class="primary" data-command="discard" disabled>出牌</button>';
  else if (myTurn) actions = actionButtons(options);
  const lastLabel = last ? shortActionLabel(last.type) : '庄家亮张';
  return `<div class="felt${openingStage ? ' opening' : ''}"${openingStage ? ` data-stage="${openingStage}"` : ''}>
    <div class="table-hud">
      ${phase !== 'finished' ? navButton('leave', 'back', '返回首页') + navButton('pause', 'settings', '设置') : ''}
      <span>${round.rules.name}</span><span>积分 ${score}</span>
    </div>
    ${seatView(round, 1, event, null, openingStage)}${seatView(round, 2, event, null, openingStage)}
    <div class="center${event?.type === '胡' ? ' winning' : ''}">
      <div class="play-area">
        <div class="deck${!openingStage && round.deck.length > 1 ? ' stacked' : ''}">
          <span class="card back deck-tile" aria-hidden="true">字${openingPile(openingStage)}</span>
          ${!openingStage ? `<span class="deck-count">余 ${round.deck.length} 张</span>` : ''}
          ${playing ? `<span class="turn-arrow to-${arrowSeat}" aria-hidden="true"></span>` : ''}
        </div>
        <div class="last-play from-${source}">
          <div class="landing">${revealTile && openingStage === 'reveal' ? '<i class="opening-back"></i>' : ''}
            ${showLastPlay || revealTile ? tile(visibleCard, false, undefined, response !== null) : ''}
          </div>
          ${showLastPlay ? `<span>${lastLabel}</span>` : ''}
        </div>
      </div>
      <div class="actions">${openingStage ? '<button data-command="skip-opening">跳过动画</button>' : actions}</div>
    </div>
    ${seatView(round, 0, event, handHint, openingStage)}
    </div>
    ${phase === 'finished' ? resultView(round.result, score) : ''}`;
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

export function showOpeningFrame(table, round, score, stage) {
  const previousCards = new Map();
  if (stage === 'sort') {
    for (const card of table.querySelectorAll('.opening-row .card')) {
      const label = card.textContent;
      if (!previousCards.has(label)) previousCards.set(label, []);
      previousCards.get(label).push(card.getBoundingClientRect());
    }
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
    for (let i = 0; i < round.rules.dealt * 3; i++) {
      const seat = (round.dealer + i) % 3;
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
  } else if (stage === 'sort') {
    const arrangedCards = table.querySelectorAll('.seat-0 .hand .card, .seat-0 .groups .card');
    arrangedCards.forEach(card => {
      const from = previousCards.get(card.textContent)?.shift();
      if (from) slideFrom(table, card, from, 560, .76);
    });
  }
}

export function animateAction(table, event) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const landing = table.querySelector('.landing .card');
  const seat = table.querySelector(`.seat-${event.seat}`);
  const origin = event.type === '摸' ? table.querySelector('.deck-tile')
    : event.fromHand && event.seat === 0 ? seat.querySelector('.hand') : seat;
  const destination = ['摸', '出', '胡'].includes(event.type) ? landing
    : [...seat.querySelectorAll(`.meld[data-meld="${event.type}"][data-cards~="${event.card}"]`)].at(-1);
  const from = (destination === landing || event.fromHand ? origin : landing).getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  const [x, y] = tableOffset(table, from, to);
  destination.animate([
    { transform: `translate(${x}px, ${y}px) scale(.72)`, opacity: .3 },
    { transform: 'translate(0, 0) scale(1.08)', opacity: 1, offset: .78 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 }
  ], { duration: 380, easing: 'cubic-bezier(.2,.72,.28,1)' });
}
