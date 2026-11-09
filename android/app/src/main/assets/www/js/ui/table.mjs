import { cardName, huxi, isRed, sortCards } from '../rules/cards.mjs';
import { arrangeHand } from './hand.mjs';

const names = ['我', '电脑一', '电脑二'];

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
  const matching = response?.type === '吃'
    ? [...response.cards, ...response.groups.slice(1).flat()] : [...(response?.cards ?? [])];
  const cardView = card => {
    const action = canDiscard ? round.options.findIndex(option => option.card === card) : -1;
    const match = matching.indexOf(card);
    if (match !== -1) matching.splice(match, 1);
    return tile(card, false, action === -1 ? undefined : action, match !== -1);
  };
  if (!round.rules.autoStack) return sortCards([...hand]).map(cardView).join('');
  const { stacks, loose } = arrangeHand(hand, round.rules.patterns);
  const stackView = cards => {
    const type = cards.length === 2 ? '对' : cards.every(card => card === cards[0]) ? '坎' : '吃';
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
    ${seat === 0 && showHand ? `<div class="hand${round.rules.autoStack ? '' : ' flat'}" aria-label="我的手牌">${playerHand(round, hand, yourDiscard, response)}</div>` : ''}
  </section>`;
}

function shortActionLabel(type) {
  return ['摸', '出'].includes(type) ? `${type}牌` : type;
}

function eatGroupNames(action) {
  return action.groups.map(group => group.map(cardName).join(''));
}

function actionLabel(action) {
  if (action.type !== '吃') return shortActionLabel(action.type);
  return `吃 ${eatGroupNames(action).join(' + ')}`;
}

function actionButtons(options, eatIndex) {
  const eats = options.filter(action => action.type === '吃');
  if (eats.length > 1) {
    return `<div class="eat-picker" data-index="${eatIndex}">
      <button class="pass" data-action="${options.length - 1}">过</button>
      <button data-command="next-eat" aria-label="换一种吃法，当前第 ${eatIndex + 1} 组，共 ${eats.length} 组">
        <svg class="change-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 9a7 7 0 0 0-12-3L4 9m0-5v5h5m-4 6a7 7 0 0 0 12 3l3-3m0 5v-5h-5"/>
        </svg>换 ${eatIndex + 1}/${eats.length}
      </button>
      <button class="primary guided" data-command="eat" aria-label="吃这组 ${eatGroupNames(eats[eatIndex]).join('、')}">吃这组</button></div>`;
  }
  return options.map((action, index) =>
    `<button class="${action.type === '过' ? 'pass' : 'primary guided'}" data-action="${index}">${actionLabel(action)}</button>`).reverse().join('');
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
    <button data-command="home">返回首页</button></div>
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

export function renderTable(round, score, event, eatIndex = 0, openingStage = '') {
  const { phase, seat, options, events } = round;
  const response = seat === 0 && phase === 'response' ? options[eatIndex] : null;
  const arrowSeat = phase === 'response' ? round.offer.source : seat;
  const last = events.findLast(({ type }) => type === '出' || type === '摸');
  const source = last?.seat ?? round.dealer;
  const visibleCard = last?.card ?? round.opening;
  const playing = !openingStage && phase !== 'finished';
  const myTurn = playing && seat === 0;
  let actions = '';
  if (myTurn && phase === 'discard') actions = '<button class="primary" data-command="discard" disabled>出牌</button>';
  else if (myTurn) actions = actionButtons(options, eatIndex);
  const lastLabel = last ? shortActionLabel(last.type) : '庄家亮张';
  return `<div class="felt${openingStage ? ' opening' : ''}"${openingStage ? ` data-stage="${openingStage}"` : ''}>
    <div class="table-hud">
      ${openingStage ? '<button data-command="home">返回</button>'
        : phase !== 'finished' ? '<button data-command="pause" aria-haspopup="dialog">返回</button>' : ''}
      <span>${round.rules.name}</span><span>积分 ${score}</span>
    </div>
    ${seatView(round, 1, event, null, openingStage)}${seatView(round, 2, event, null, openingStage)}
    <div class="center${event?.type === '胡' ? ' winning' : ''}">
      <div class="play-area">
        <div class="deck">
          <span class="deck-tile" aria-hidden="true">字${openingPile(openingStage)}</span>
          ${!openingStage ? `<span class="deck-count">余 ${round.deck.length} 张</span>` : ''}
          ${playing ? `<span class="turn-arrow to-${arrowSeat}" aria-hidden="true"></span>` : ''}
        </div>
        <div class="last-play from-${source}">
          <div class="landing">${openingStage === 'reveal' ? '<i class="opening-back"></i>' : ''}
            ${!openingStage || ['reveal', 'sort'].includes(openingStage) ? tile(visibleCard, false, undefined, response !== null) : ''}
          </div>
          ${!openingStage ? `<span>${lastLabel}</span>` : ''}
        </div>
      </div>
      <div class="actions">${openingStage ? '<button data-command="skip-opening">跳过动画</button>' : actions}</div>
    </div>
    ${seatView(round, 0, event, response, openingStage)}
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

  table.innerHTML = renderTable(round, score, null, 0, stage);
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
  const origin = event.type === '摸' ? table.querySelector('.deck-tile') : seat;
  const destination = ['摸', '出', '胡'].includes(event.type) ? landing
    : [...seat.querySelectorAll(`.meld[data-meld="${event.type}"][data-cards~="${event.card}"]`)].at(-1);
  const from = (destination === landing ? origin : landing).getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  const [x, y] = tableOffset(table, from, to);
  destination.animate([
    { transform: `translate(${x}px, ${y}px) scale(.72)`, opacity: .3 },
    { transform: 'translate(0, 0) scale(1.08)', opacity: 1, offset: .78 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 }
  ], { duration: 380, easing: 'cubic-bezier(.2,.72,.28,1)' });
}
