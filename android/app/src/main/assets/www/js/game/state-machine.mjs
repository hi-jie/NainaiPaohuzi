import { countCard, patterns, sortCards, takeCards } from '../rules/cards.mjs';
import { canHuFrom, concealedDraw, nextSeat, ownForcedMeld, responses } from '../rules/actions.mjs?v=250';
import { findHu } from '../rules/hu.mjs?v=250';
import { defaultSettings, presets } from '../rules/presets.mjs?v=250';
import { settle } from '../rules/scoring.mjs?v=250';
import { shuffledDeck } from './deck.mjs';

function openingQuads(hand) {
  return [...new Set(hand)].filter(card => countCard(hand, card) === 4);
}

const responsePass = { type: '过' };

function restoreDiscardHistory(events, seats) {
  const history = Array.from({ length: seats }, () => ({ ownDiscards: [], chongpao: false }));
  const wei = Array.from({ length: seats }, () => new Set());
  for (const [index, event] of events.entries()) {
    const { type, seat, card } = event;
    if (type === '出') history[seat].ownDiscards.push(card);
    if (type === '偎') wei[seat].add(card);
    if (type === '提') wei[seat].delete(card);
    if (type !== '跑' || !wei[seat].delete(card)) continue;
    const prior = events[index - 1];
    if (prior?.type === '出' && prior.card === card) history[prior.seat].chongpao = true;
  }
  return history;
}

export class Round {
  constructor(settings, dealer, random = Math.random, deck = shuffledDeck(random), { deferOpening = false } = {}) {
    this.rules = { openMelds: defaultSettings.openMelds, ...settings, ...presets[settings.mode], patterns: patterns(settings.oneFiveTen) };
    this.dealer = dealer;
    this.deck = [...deck];
    this.players = Array.from({ length: this.rules.seats }, () => ({
      hand: [], groups: [], discards: [], passedChi: new Set(), passedPeng: new Set(), passedHu: -1,
      ownDiscards: [], chongpao: false
    }));
    this.events = [];

    let seat = dealer;
    for (let turn = 0; turn < this.players.length * this.rules.dealt; turn++) {
      this.players[seat].hand.push(this.deck.pop());
      seat = nextSeat(seat, this.players.length);
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
    const legacy = state.players.some(player => !player.ownDiscards);
    const history = legacy ? restoreDiscardHistory(state.events, state.players.length) : [];
    const players = state.players.map((player, seat) => ({
      ...history[seat], ...player, passedChi: new Set(player.passedChi), passedPeng: new Set(player.passedPeng),
      groups: player.groups.map(group => {
        if (!['碰', '偎', '跑', '提'].includes(group.type)) return group;
        const card = group.cards[0];
        const wasTaken = group.offeredCard !== undefined || state.events.some(event =>
          event.seat === seat && event.type === group.type && event.card === card && !event.fromHand);
        const stinky = group.type === '偎' && player.passedPeng.includes(card);
        return wasTaken ? { ...group, offeredCard: card, ...(stinky ? { stinky } : {}) } : group;
      })
    }));
    const rules = { openMelds: defaultSettings.openMelds, ...state.rules };
    const round = Object.assign(Object.create(Round.prototype), state, { players, rules });
    if (legacy && round.phase === 'response') {
      const { source, card, kind } = round.offer;
      round.reveal(source, card, kind);
    }
    if (state.rules.openMelds === undefined && rules.mode === 'fifteen') {
      const belowMinimum = choices => choices[0]?.type === '胡' && choices[0].hu.huxi < rules.minimum;
      if (round.phase === 'response') {
        round.queue = round.queue.filter(({ choices }) => !belowMinimum(choices));
        if (belowMinimum(round.options)) round.advanceResponse();
      } else if (round.phase === 'after-meld' && belowMinimum(round.options)) {
        round.finishMeld(round.repeatQuad);
      }
    }
    if (round.phase === 'draw' && !round.deck.length) round.waitForDraw(round.seat);
    return round;
  }

  revealOpening() {
    delete this.openingHand;
    this.reveal(this.dealer, this.opening, 'opening');
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
      seat = nextSeat(seat, this.players.length);
    } while (seat !== 0);
    if (!this.offer) {
      // Older saves started the automatic Ti before the opening response.
      this.reveal(this.dealer, this.opening, 'opening');
      return;
    }
    const player = this.players[this.dealer];
    const forced = ownForcedMeld(player, this.opening);
    if (forced) {
      this.phase = 'response';
      this.seat = this.dealer;
      this.options = [forced];
      return;
    }
    this.offer = null;
    player.hand.push(this.opening);
    sortCards(player.hand);
    this.waitForDiscard(this.dealer);
  }

  record(type, seat, card) {
    this.events.push({ type, seat, card });
  }

  waitForDiscard(seat) {
    this.phase = 'discard';
    this.seat = seat;
    this.options = this.discardOptions(seat);
    if (!this.options.length) this.waitForDraw(nextSeat(seat, this.players.length));
  }

  discardOptions(seat) {
    const hand = this.players[seat].hand;
    return [...new Set(hand)].filter(card => countCard(hand, card) < 3)
      .map(card => ({ type: '出', card }));
  }

  waitForDraw(seat) {
    if (!this.deck.length) {
      this.finish({
        winner: null,
        delta: this.players.map(() => 0),
        nextDealer: nextSeat(this.dealer, this.players.length)
      });
      return;
    }
    this.phase = 'draw';
    this.seat = seat;
    this.options = [{ type: '摸' }];
  }

  reveal(source, card, kind) {
    delete this.pendingResponse;
    this.offer = { source, card, kind };
    this.queue = [];
    let seat = source;
    do {
      const choices = responses(this.players[seat], seat, this.offer, this.rules);
      for (const priority of new Set(choices.map(choice => choice.priority))) {
        this.queue.push({ seat, priority, choices: choices.filter(choice => choice.priority === priority) });
      }
      seat = nextSeat(seat, this.players.length);
    } while (seat !== source);
    this.queue.sort((a, b) => a.priority - b.priority);
    this.advanceResponse();
  }

  playerResponseGroups() {
    if (this.phase !== 'response' || this.pendingResponse) return [];
    if (this.seat !== 0 && concealedDraw(this)) return [];
    const groups = [];
    for (const { seat, choices } of [{ seat: this.seat, choices: this.options }, ...this.queue]) {
      if (seat !== 0) continue;
      if (choices[0].forced) break;
      groups.push(choices.filter(choice => choice.type !== '过'));
    }
    return groups;
  }

  get playerResponses() {
    if (this.phase !== 'response') return null;
    const choices = this.playerResponseGroups().flat();
    return choices.length ? [...choices, responsePass] : [];
  }

  submitPlayerResponse(action) {
    const groups = this.playerResponseGroups();
    const choices = action === responsePass ? groups[0] : groups.find(group => group.includes(action));
    if (!choices) throw new Error('动作已失效');
    this.pendingResponse = { priority: choices[0].priority, index: choices.indexOf(action), type: action.type };
  }

  get pendingPlayerAction() {
    if (this.phase !== 'response' || this.seat !== 0 || !this.pendingResponse) return null;
    const { priority, index } = this.pendingResponse;
    return this.options[0].priority === priority && index >= 0 ? this.options[index] : this.options.at(-1);
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
    const { source, kind } = this.offer;
    delete this.pendingResponse;
    if (kind === 'opening') {
      this.waitForOpeningTi(0);
    } else if (kind === 'draw' && !this.deck.length) {
      this.phase = 'last-draw';
      this.seat = source;
      this.options = [{ type: '黄庄', forced: true }];
    } else {
      this.finishUnclaimedOffer();
    }
  }

  finishUnclaimedOffer() {
    const { source, card, kind } = this.offer;
    this.offer = null;
    if (kind === 'draw') this.players[source].discards.push(card);
    this.waitForDraw(nextSeat(source, this.players.length));
  }

  act(action) {
    if (!this.options.includes(action)) throw new Error('动作已失效');
    const seat = this.seat;
    const player = this.players[seat];
    const { type } = action;
    if (type === '黄庄') {
      this.finishUnclaimedOffer();
      return;
    }
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
      const card = this.deck.pop();
      this.record(type, seat, card);
      this.reveal(seat, card, 'draw');
      return;
    }
    if (type === '出') {
      player.hand = takeCards(player.hand, [action.card]);
      player.discards.push(action.card);
      player.ownDiscards.push(action.card);
      player.passedChi.add(action.card);
      this.record(type, seat, action.card);
      this.reveal(seat, action.card, 'discard');
      return;
    }

    const { card, source, kind } = this.offer;
    if (type === '过') {
      const declined = this.options[0];
      if (seat === 0 && this.pendingResponse?.priority === declined.priority) delete this.pendingResponse;
      if (declined.type === '吃') player.passedChi.add(card);
      if (declined.type === '碰') player.passedPeng.add(card);
      if (declined.type === '胡') player.passedHu = declined.hu.huxi;
      if (this.phase === 'after-meld') this.finishMeld(this.repeatQuad);
      else this.advanceResponse();
      return;
    }
    delete this.pendingResponse;
    if (type === '胡') {
      if (this.phase === 'response' && kind === 'discard') this.players[source].discards.pop();
      if (kind === 'opening' && action.hu.usesOpening === false) {
        this.players[source].hand.push(card);
        sortCards(this.players[source].hand);
      }
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
      player.groups.push({ type, cards: group, offeredCard: card });
      for (const cards of companions) player.groups.push({ type, cards });
    } else {
      const size = type === '偎' || type === '碰' ? 3 : 4;
      const group = { type, cards: Array(size).fill(card), offeredCard: card };
      if (type === '偎' && player.passedPeng.has(card)) group.stinky = true;
      if (type === '跑' && kind === 'discard' && this.rules.openMelds && player.groups[action.previous]?.type === '偎') {
        this.players[source].chongpao = true;
      }
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
    if (repeatQuad) this.waitForDraw(nextSeat(this.seat, this.players.length));
    else this.waitForDiscard(this.seat);
  }

  finish(result) {
    this.phase = 'finished';
    this.options = [];
    this.result = result;
  }
}
