import { nextSeat } from '../rules/actions.mjs?v=141';
import { sortCards, takeCards } from '../rules/cards.mjs';
import { findMahjongHu, mahjongPatterns } from '../rules/mahjong.mjs';
import { presets } from '../rules/presets.mjs?v=141';
import { shuffledDeck } from './deck.mjs';

export class MahjongRound {
  constructor(settings, dealer, random = Math.random, deck = shuffledDeck(random), { deferOpening = false } = {}) {
    const preset = presets.mahjong;
    this.rules = { ...settings, ...preset, seats: settings.mahjongSeats ?? preset.seats, patterns: mahjongPatterns };
    this.dealer = dealer;
    this.deck = [...deck];
    this.players = Array.from({ length: this.rules.seats }, () => ({
      hand: [], groups: [], discards: [], passedHu: false
    }));
    this.events = [];
    this.offer = null;
    let seat = dealer;
    for (let i = 0; i < this.players.length * this.rules.dealt + 1; i++) {
      this.players[seat].hand.push(this.deck.pop());
      seat = this.next(seat);
    }
    if (deferOpening) this.openingHand = [...this.players[0].hand];
    for (const player of this.players) sortCards(player.hand);
    if (!deferOpening) this.revealOpening();
  }

  next(seat) {
    return nextSeat(seat, this.players.length);
  }

  toSave() {
    return { ...this };
  }

  static fromSave(state) {
    return Object.assign(Object.create(MahjongRound.prototype), state);
  }

  revealOpening() {
    delete this.openingHand;
    this.waitForDiscard(this.dealer, true);
  }

  waitForDiscard(seat, canSelfDraw) {
    this.phase = 'discard';
    this.seat = seat;
    const { hand } = this.players[seat];
    this.options = [...new Set(hand)].map(card => ({ type: '出', card }));
    const hu = canSelfDraw && findMahjongHu(hand);
    if (hu) this.options.unshift({ type: '胡', hu });
  }

  waitForResponse(from) {
    const { source, card } = this.offer;
    for (let seat = from; seat !== source; seat = this.next(seat)) {
      const player = this.players[seat];
      const hu = !player.passedHu && findMahjongHu([...player.hand, card]);
      if (hu) {
        this.phase = 'response';
        this.seat = seat;
        this.options = [{ type: '胡', hu }, { type: '过' }];
        return;
      }
    }
    this.phase = 'claim';
    this.seat = this.next(source);
    this.options = [{ type: '吃' }, { type: '摸' }];
  }

  act(action) {
    if (!this.options.includes(action)) throw new Error('动作已失效');
    const { type } = action;
    const { seat, offer } = this;
    const player = this.players[seat];
    if (type === '过') {
      player.passedHu = true;
      this.waitForResponse(this.next(seat));
    } else if (type === '胡') {
      if (offer) player.hand = sortCards([...player.hand, offer.card]);
      this.events.push({ type, seat });
      const delta = this.players.map((_, index) => !offer || index === offer.source ? -1 : 0);
      delta[seat] = offer ? 1 : this.players.length - 1;
      this.finish({ winner: seat, hu: action.hu, kind: offer ? 'discard' : 'self', delta, nextDealer: seat });
    } else if (type === '出') {
      player.hand = takeCards(player.hand, [action.card]);
      this.offer = { source: seat, card: action.card, kind: 'discard' };
      this.events.push({ type, seat, card: action.card });
      this.waitForResponse(this.next(seat));
    } else {
      this.offer = null;
      if (type === '摸') {
        this.players[offer.source].discards.push(offer.card);
        if (!this.deck.length) {
          this.finish({ winner: null, delta: this.players.map(() => 0), nextDealer: this.next(this.dealer) });
          return;
        }
      }
      const card = type === '吃' ? offer.card : this.deck.pop();
      player.hand = sortCards([...player.hand, card]);
      player.passedHu = false;
      this.events.push({ type, seat, card });
      this.waitForDiscard(seat, type === '摸');
    }
  }

  finish(result) {
    this.offer = null;
    this.phase = 'finished';
    this.options = [];
    this.result = result;
  }
}
