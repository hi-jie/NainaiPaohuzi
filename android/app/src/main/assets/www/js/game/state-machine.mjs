import { countCard, patterns, sortCards, takeCards } from '../rules/cards.mjs';
import { canHuFrom, nextSeat, responses } from '../rules/actions.mjs?v=66';
import { findHu } from '../rules/hu.mjs?v=65';
import { presets } from '../rules/presets.mjs';
import { settle } from '../rules/scoring.mjs?v=65';
import { shuffledDeck } from './deck.mjs';

function openingQuads(hand) {
  return [...new Set(hand)].filter(card => countCard(hand, card) === 4);
}

export class Round {
  constructor(settings, dealer, random = Math.random, deck = shuffledDeck(random), { deferOpening = false } = {}) {
    this.rules = { ...settings, ...presets[settings.mode], patterns: patterns(settings.oneFiveTen) };
    this.dealer = dealer;
    this.deck = [...deck];
    this.players = Array.from({ length: 3 }, () => ({
      hand: [], groups: [], discards: [], passedChi: new Set(), passedPeng: new Set(), passedHu: -1
    }));
    this.events = [];
    this.discardCount = 0;

    let seat = dealer;
    for (let turn = 0; turn < 3 * this.rules.dealt; turn++) {
      this.players[seat].hand.push(this.deck.pop());
      seat = nextSeat(seat);
    }
    if (deferOpening) this.openingHand = [...this.players[0].hand];
    this.opening = this.deck.pop();
    for (const player of this.players) sortCards(player.hand);
    if (!deferOpening) this.revealOpening();
  }

  toSave() {
    return {
      ...this,
      players: this.players.map(player => ({
        ...player, passedChi: [...player.passedChi], passedPeng: [...player.passedPeng]
      }))
    };
  }

  static fromSave(state) {
    const players = state.players.map(player => ({
      ...player, passedChi: new Set(player.passedChi), passedPeng: new Set(player.passedPeng)
    }));
    return Object.assign(Object.create(Round.prototype), state, { players });
  }

  revealOpening() {
    delete this.openingHand;
    this.waitForOpeningTi(0);
  }

  get hasOpeningTi() {
    return this.players.some(({ hand }) => openingQuads(hand).length > 0);
  }

  waitForOpeningTi(fromSeat) {
    let seat = fromSeat;
    do {
      const { hand } = this.players[seat];
      const options = openingQuads(hand)
        .map(card => ({ type: '提', card, cards: [card, card, card, card], forced: true }));
      if (options.length) {
        this.phase = 'opening-ti';
        this.seat = seat;
        this.options = options;
        return;
      }
      seat = nextSeat(seat);
    } while (seat !== 0);
    this.reveal(this.dealer, this.opening, 'opening');
  }

  record(type, seat, card) {
    this.events.push({ type, seat, card });
  }

  waitForDiscard(seat) {
    this.phase = 'discard';
    this.seat = seat;
    this.options = this.discardOptions(seat);
    if (!this.options.length) this.waitForDraw(nextSeat(seat));
  }

  discardOptions(seat) {
    const hand = this.players[seat].hand;
    return [...new Set(hand)].filter(card => countCard(hand, card) < 3)
      .map(card => ({ type: '出', card }));
  }

  waitForDraw(seat) {
    this.phase = 'draw';
    this.seat = seat;
    this.options = [{ type: '摸' }];
  }

  reveal(source, card, kind) {
    this.offer = { source, card, kind, first: kind === 'discard' && this.discardCount === 1 };
    this.queue = [];
    for (const seat of [source, nextSeat(source), nextSeat(nextSeat(source))]) {
      const choices = responses(this.players[seat], seat, this.offer, this.rules);
      for (const priority of new Set(choices.map(choice => choice.priority))) {
        this.queue.push({ seat, priority, choices: choices.filter(choice => choice.priority === priority) });
      }
    }
    this.queue.sort((a, b) => a.priority - b.priority);
    this.advanceResponse();
  }

  advanceResponse() {
    const candidate = this.queue.shift();
    if (candidate) {
      this.seat = candidate.seat;
      this.phase = 'response';
      this.options = candidate.choices;
      if (!this.options[0].forced) this.options.push({ type: '过' });
      return;
    }
    const { source, card, kind } = this.offer;
    this.offer = null;
    if (kind === 'opening') {
      const hand = this.players[source].hand;
      hand.push(card);
      sortCards(hand);
      this.waitForDiscard(source);
    } else {
      if (kind === 'draw') this.players[source].discards.push(card);
      this.waitForDraw(nextSeat(source));
    }
  }

  act(action) {
    if (!this.options.includes(action)) throw new Error('动作已失效');
    const seat = this.seat;
    const player = this.players[seat];
    const { type } = action;
    if (this.phase === 'opening-ti') {
      player.hand = takeCards(player.hand, action.cards);
      player.groups.push({ type, cards: action.cards });
      if (player.groups.length > 1) {
        player.hand.push(this.deck.pop());
        sortCards(player.hand);
      }
      this.events.push({ type, seat, card: action.card, fromHand: true });
      this.waitForOpeningTi(seat);
      return;
    }
    if (type === '摸') {
      if (!this.deck.length) {
        this.finish({ winner: null, delta: [0, 0, 0] });
        return;
      }
      const card = this.deck.pop();
      this.record(type, seat, card);
      this.reveal(seat, card, 'draw');
      return;
    }
    if (type === '出') {
      player.hand = takeCards(player.hand, [action.card]);
      player.discards.push(action.card);
      player.passedChi.add(action.card);
      this.discardCount++;
      this.record(type, seat, action.card);
      this.reveal(seat, action.card, 'discard');
      return;
    }

    const { card, source, kind } = this.offer;
    if (type === '过') {
      const declined = this.options[0];
      if (declined.type === '吃') player.passedChi.add(card);
      if (declined.type === '碰') player.passedPeng.add(card);
      if (declined.type === '胡') player.passedHu = declined.hu.huxi;
      if (this.phase === 'after-meld') this.finishMeld(this.repeatQuad);
      else this.advanceResponse();
      return;
    }
    if (type === '胡') {
      if (this.phase === 'response' && kind === 'discard') this.players[source].discards.pop();
      this.record(type, seat, card);
      this.finish(settle(seat, this.offer, action.hu, this.rules));
      return;
    }

    const quads = player.groups.filter(group => ['跑', '提'].includes(group.type)).length;
    player.hand = takeCards(player.hand, action.cards);
    if (kind === 'discard') this.players[source].discards.pop();
    if (type === '吃') {
      const [group, ...companions] = action.groups;
      player.hand = takeCards(player.hand, companions.flat());
      for (const cards of [group, ...companions]) player.groups.push({ type, cards });
    } else {
      const size = type === '偎' || type === '碰' ? 3 : 4;
      const group = { type, cards: Array(size).fill(card) };
      if (action.previous >= 0) player.groups[action.previous] = group;
      else player.groups.push(group);
    }
    this.record(type, seat, card);
    if (action.forced && canHuFrom(kind, this.rules)) {
      const hu = findHu(player, null, false, this.rules);
      if (hu) {
        this.phase = 'after-meld';
        this.options = [{ type: '胡', hu }, { type: '过' }];
        this.repeatQuad = quads > 0 && (type === '跑' || type === '提') && kind !== 'opening';
        return;
      }
    }
    this.finishMeld(quads > 0 && (type === '跑' || type === '提') && kind !== 'opening');
  }

  finishMeld(repeatQuad) {
    this.offer = null;
    if (repeatQuad) this.waitForDraw(nextSeat(this.seat));
    else this.waitForDiscard(this.seat);
  }

  finish(result) {
    this.phase = 'finished';
    this.options = [];
    this.result = result;
  }
}
