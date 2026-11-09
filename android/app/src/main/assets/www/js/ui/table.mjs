import { cardName, isRed, sortCards } from '../rules/cards.mjs';
import { arrangeHand } from './hand.mjs';

const names = ['我', '电脑一', '电脑二'];
const avatars = ['我', '东', '西'];

function tile(card, hidden = false, action, hinted = false) {
  const classes = `card${hidden ? ' back' : isRed(card) ? ' red' : ''}${hinted ? ' hinted' : ''}`;
  if (action !== undefined) {
    return `<button class="${classes}" data-action="${action}" aria-label="打出${cardName(card)}">${cardName(card)}</button>`;
  }
  return `<span class="${classes}">${hidden ? '◆' : cardName(card)}</span>`;
}

function meld(group, hide = false) {
  return `<span class="meld" data-meld="${group.type}" data-cards="${group.cards.join(' ')}"><b>${group.type}</b>${group.cards.map((card, index) => tile(card, hide && index > 0)).join('')}</span>`;
}

function turnLabel(round) {
  const { phase, seat, options } = round;
  if (phase === 'finished') return '本局结束';
  if (phase === 'discard') return seat === 0 ? '请点一张手牌打出' : `${names[seat]}正在选牌…`;
  if (phase === 'draw') return seat === 0 ? '轮到我摸牌' : `轮到${names[seat]}摸牌…`;
  if (options[0].forced) return `${names[seat]}即将${options[0].type}牌`;
  return seat === 0 ? `可${options[0].type} · 请选择` : `${names[seat]}正在考虑…`;
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
  const stackView = (cards, isLoose) =>
    `<div class="hand-stack${isLoose ? ' loose' : ''}">${cards.map(cardView).join('')}</div>`;
  return stacks.map(cards => stackView(cards, false)).join('') + loose.map(cards => stackView(cards, true)).join('');
}

function seatView(round, seat, response) {
  const { hand, groups, discards } = round.players[seat];
  const active = round.seat === seat && round.phase !== 'finished';
  const yourDiscard = seat === 0 && active && round.phase === 'discard';
  return `<section class="seat seat-${seat}${active ? ' active' : ''}">
    <div class="seat-heading">
      <span class="avatar" aria-hidden="true">${avatars[seat]}</span>
      <h3>${names[seat]}</h3>
      <span class="dealer" ${round.dealer === seat ? '' : 'inert aria-hidden="true"'}>庄</span>
      ${seat !== 0 ? `<span class="count">剩 <strong>${hand.length}</strong> 张</span>` : ''}
    </div>
    ${seat !== 0 ? `<div class="opponent-backs" aria-hidden="true">${'<span></span>'.repeat(hand.length)}</div>` : ''}
    <div class="groups">${groups.map(group => meld(group, seat !== 0 && ['偎', '提'].includes(group.type))).join('')}</div>
    <button class="discarded" data-history="${seat}" data-view="discards" ${discards.length ? '' : 'disabled'} aria-label="${names[seat]}的弃牌，${discards.length}张">
      <span class="discard-preview" aria-hidden="true">${discards.slice(-3).map(card => tile(card)).join('')}</span>
      <span>${seat === 0 ? '我的弃牌' : '弃牌'} <b>${discards.length}</b></span>
    </button>
    ${seat === 0 ? `<div class="hand${round.rules.autoStack ? '' : ' flat'}" aria-label="我的手牌">${playerHand(round, hand, yourDiscard, response)}</div>` : ''}
  </section>`;
}

function actionLabel(action) {
  if (action.type === '摸') return '摸牌';
  if (action.type !== '吃') return action.type;
  return `吃 ${action.groups.map(group => group.map(cardName).join('')).join(' + ')}`;
}

function actionButtons(options, eatIndex, guiding) {
  const eats = options.filter(action => action.type === '吃');
  if (eats.length > 1) {
    return `<div class="eat-picker" data-index="${eatIndex}">
      <strong class="eat-label" aria-live="polite">${actionLabel(eats[eatIndex])}</strong>
      <button class="primary guided" data-command="eat">吃这组</button>
      <button data-command="next-eat">换一种 ${eatIndex + 1}/${eats.length}</button>
      <button class="pass" data-action="${options.length - 1}">过</button></div>`;
  }
  return options.map((action, index) =>
    `<button class="${action.type === '过' ? 'pass' : guiding ? 'primary guided' : 'primary'}" data-action="${index}">${actionLabel(action)}</button>`).join('');
}

export function renderHistory(round, seat, view) {
  const player = round.players[seat];
  const content = view === 'groups'
    ? `<div class="groups">${player.groups.map(group => meld(group, seat !== 0 && ['偎', '提'].includes(group.type))).join('')}</div>`
    : `<p class="history-count">共 ${player.discards.length} 张</p>
    <div class="history-cards" role="region" aria-label="按出现顺序排列的弃牌" tabindex="0">
      ${player.discards.map(card => tile(card)).join('')}
    </div>`;
  return `<h2>${names[seat]}的${view === 'groups' ? '落地牌' : '弃牌'}</h2>${content}
    <form method="dialog"><button class="primary" autofocus>关闭</button></form>`;
}

function resultView({ winner, hu, names: bonuses, tun, delta }, score) {
  const details = winner === null ? '' : `
    <div class="groups">${hu.groups.map(group => meld(group)).join('')}</div>
    <p>${hu.huxi} 胡息 · ${tun} 囤 · ${bonuses.map(([name, multiple]) => `${name} ×${multiple}`).join('、')}</p>`;
  return `<div class="settlement"><section class="panel result" aria-live="polite">
    <small>本局结算</small>
    <h2>${winner === null ? '黄庄' : `${names[winner]}胡牌`}</h2>
    ${details}
    <div class="deltas">${delta.map((value, seat) => `<div><span>${names[seat]}</span><strong class="${value < 0 ? 'loss' : ''}">${value > 0 ? '+' : ''}${value}</strong></div>`).join('')}</div>
    <p>累计积分 ${score}</p>
    <div class="actions"><button class="primary" data-command="again">再来一局</button>
    <button data-command="home">返回首页</button></div>
  </section></div>`;
}

export function renderTable(round, score, event, eatIndex = 0) {
  const { phase, seat, options, offer, events } = round;
  const response = seat === 0 && phase === 'response' ? options[eatIndex] : null;
  const last = events.at(-1);
  const visibleCard = last ? (offer && ['出', '摸'].includes(last.type) ? offer.card : last.card) : round.opening;
  const actions = phase !== 'finished' && phase !== 'discard' && seat === 0 && !options[0].forced
    ? actionButtons(options, eatIndex, response !== null) : '';
  const lastLabel = last ? `${names[last.seat]}${last.type}${['摸', '出'].includes(last.type) ? '牌' : ''}` : '庄家亮张';
  return `<div class="felt">
    <div class="table-hud">
      ${phase !== 'finished' ? '<button data-command="pause" aria-haspopup="dialog">返回</button>' : ''}
      <span>${round.rules.name}</span><span>积分 ${score}</span>
    </div>
    ${seatView(round, 1)}${seatView(round, 2)}
    <div class="center${event?.type === '胡' ? ' winning' : ''}">
      <div class="play-area">
        <div class="deck"><span class="deck-tile" aria-hidden="true">字</span><span>余 ${round.deck.length} 张</span></div>
        <div class="last-play">
          <div class="landing">${tile(visibleCard, false, undefined, response !== null)}</div>
          <span>${lastLabel}</span>
        </div>
        ${event && !['摸', '出'].includes(event.type) ? `<span class="callout" aria-hidden="true">${event.type}</span>` : ''}
      </div>
      <strong class="turn-status" aria-live="polite">${turnLabel(round)}</strong>
      <div class="actions">${actions}</div>
    </div>
    ${seatView(round, 0, response)}
    </div>
    ${phase === 'finished' ? resultView(round.result, score) : ''}`;
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
  const scale = Number(table.style.getPropertyValue('--table-scale'));
  const screenX = (from.left + (from.width - to.width) / 2 - to.left) / scale;
  const screenY = (from.top + (from.height - to.height) / 2 - to.top) / scale;
  const rotated = matchMedia('(orientation: portrait)').matches;
  const [x, y] = rotated ? [screenY, -screenX] : [screenX, screenY];
  destination.animate([
    { transform: `translate(${x}px, ${y}px) scale(.72)`, opacity: .3 },
    { transform: 'translate(0, 0) scale(1.08)', opacity: 1, offset: .78 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 }
  ], { duration: 380, easing: 'cubic-bezier(.2,.72,.28,1)' });
}
