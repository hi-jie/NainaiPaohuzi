import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAction } from '../android/app/src/main/assets/www/js/ai/player.mjs';
import { MahjongRound } from '../android/app/src/main/assets/www/js/game/mahjong-round.mjs';
import { findMahjongHu } from '../android/app/src/main/assets/www/js/rules/mahjong.mjs';
import { renderTable } from '../android/app/src/main/assets/www/js/ui/table.mjs';

const settings = { mode: 'mahjong', mahjongSeats: 3 };
const waiting = [0, 1, 2, 3, 4, 10, 14, 14, 14, 19];
const choose = (round, type, card) => round.act(round.options.find(action =>
  action.type === type && (card === undefined || action.card === card)));

function fixture(seats = 3) {
  const round = new MahjongRound({ ...settings, mahjongSeats: seats }, 0);
  for (const player of round.players) player.hand = [];
  return round;
}

function offer(round, source, card) {
  round.players[source].hand = [card];
  round.waitForDiscard(source, false);
  choose(round, '出', card);
}

test('三顺一对承认一五十和二七十，排除刻子、大小混搭及错误张数', () => {
  assert.ok(findMahjongHu([0, 1, 2, 1, 6, 9, 10, 14, 19, 3, 3]));
  assert.ok(findMahjongHu([...waiting, 2]));
  assert.ok(findMahjongHu([...waiting, 5]));
  assert.equal(findMahjongHu([0, 0, 0, 1, 6, 9, 10, 14, 19, 3, 3]), null);
  assert.equal(findMahjongHu([0, 0, 10, 1, 6, 9, 10, 14, 19, 3, 3]), null);
  assert.equal(findMahjongHu(waiting), null);
});

test('多人接炮逆时针顺延，只由放炮人付一分', () => {
  const round = fixture(5);
  round.players[2].hand = waiting;
  // 两个接炮者各使用不同的顺子和对子，等同一张小三。
  round.players[3].hand = [0, 1, 3, 4, 5, 6, 7, 8, 11, 11];
  offer(round, 0, 2);
  assert.equal(round.seat, 2);
  choose(round, '过');
  assert.equal(round.seat, 3);
  choose(round, '胡');
  assert.deepEqual(round.result.delta, [-1, 0, 0, 1, 0]);
  assert.equal(round.result.nextDealer, 3);
  assert.equal(round.players[3].hand.length, 11);
});

test('过胡限制所有接炮，摸牌可立即自摸', () => {
  const round = fixture();
  round.players[0].hand = [...waiting];
  offer(round, 1, 2);
  choose(round, '过');
  assert.equal(round.players[0].passedHu, true);
  offer(round, 1, 5);
  assert.equal(round.phase, 'claim');
  round.deck = [5];
  choose(round, '摸');
  assert.equal(round.players[0].passedHu, false);
  choose(round, '胡');
  assert.deepEqual(round.result.delta, [2, -1, -1]);
  assert.equal(round.result.kind, 'self');
});

test('暗吃解除过胡，吃成牌也要先出，可以原牌打回', () => {
  const round = fixture();
  round.players[0].hand = [...waiting];
  offer(round, 1, 2);
  choose(round, '过');
  const restored = MahjongRound.fromSave(JSON.parse(JSON.stringify(round.toSave())));
  choose(restored, '吃');
  assert.equal(restored.players[0].passedHu, false);
  assert.equal(restored.players[0].hand.length, 11);
  assert.ok(restored.options.every(({ type }) => type === '出'));
  assert.equal(restored.players[1].discards.length, 0);
  choose(restored, '出', 2);
  assert.equal(restored.players[0].hand.length, 10);
});

test('同名旧弃牌留在弃牌堆，只有上家刚打出的牌能吃', () => {
  const round = fixture();
  round.players[0].discards = [8];
  round.players[1].discards = [8];
  offer(round, 1, 8);
  assert.equal(round.seat, 0);
  choose(round, '吃');
  assert.deepEqual(round.players[0].hand, [8]);
  assert.deepEqual(round.players[0].discards, [8]);
  assert.deepEqual(round.players[1].discards, [8]);
  assert.equal(round.offer, null);
  assert.deepEqual(round.options.map(({ type }) => type), ['出']);
});

test('续局保留多人接炮次序，庄家起手胡按自摸结算', () => {
  const round = fixture(5);
  round.players[2].hand = waiting;
  round.players[3].hand = [0, 1, 3, 4, 5, 6, 7, 8, 11, 11];
  offer(round, 0, 2);
  choose(round, '过');
  const restored = MahjongRound.fromSave(JSON.parse(JSON.stringify(round.toSave())));
  assert.equal(restored.seat, 3);
  assert.equal(restored.players[2].passedHu, true);
  choose(restored, '过');
  assert.equal(restored.phase, 'claim');
  assert.equal(restored.seat, 2);
  assert.equal(restored.offer.card, 2);

  const opening = fixture(5);
  opening.players[0].hand = [...waiting, 2];
  opening.revealOpening();
  const before = opening.deck.length;
  choose(opening, '胡');
  assert.equal(opening.deck.length, before);
  assert.deepEqual(opening.result.delta, [4, -1, -1, -1, -1]);
  assert.equal(opening.result.kind, 'self');
});

test('空墩可继续吃打，需要摸牌时才黄庄，下家接庄', () => {
  const round = fixture();
  round.deck = [];
  offer(round, 0, 8);
  for (const seat of [2, 1]) {
    assert.equal(round.seat, seat);
    choose(round, '吃');
    choose(round, '出', 8);
  }
  assert.equal(round.phase, 'claim');
  choose(round, '摸');
  assert.deepEqual(round.result, { winner: null, delta: [0, 0, 0], nextDealer: 2 });
});

test('对家的私摸不出现在桌面，暗吃直接提供吃和摸按钮', () => {
  const round = fixture();
  offer(round, 1, 8);
  const claim = renderTable(round, 0);
  assert.match(claim, /data-action="0"[^>]*>吃/);
  assert.match(claim, /data-action="1"[^>]*>摸牌/);
  assert.doesNotMatch(claim, /choose-eat|seat-score/);
  offer(round, 0, 8);
  round.deck = [5];
  choose(round, '摸');
  const drawn = renderTable(round, 0, round.events.at(-1));
  assert.doesNotMatch(drawn, /class="landing">\s*<span/);
  assert.doesNotMatch(drawn, /六/);
});

test('3 至 5 人发牌、整局行牌、牌数与结算分数守恒', () => {
  for (const seats of [3, 4, 5]) {
    for (let seed = 1; seed <= 20; seed++) {
      let state = seed;
      const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
      const dealer = seed % seats;
      const round = new MahjongRound({ ...settings, mahjongSeats: seats }, dealer, random);
      assert.deepEqual(round.players.map(({ hand }, seat) => hand.length === 10 + Number(seat === dealer)),
        Array(seats).fill(true));
      assert.equal(round.deck.length, 79 - seats * 10);
      for (let steps = 0; round.phase !== 'finished'; steps++) {
        assert.ok(steps < 1000, `${seats} 人第 ${seed} 局未结束`);
        round.act(chooseAction(round));
        const cards = [...round.deck, ...round.players.flatMap(({ hand, discards }) => [...hand, ...discards])];
        if (round.offer) cards.push(round.offer.card);
        assert.equal(cards.length, 80);
        for (let card = 0; card < 20; card++) assert.equal(cards.filter(value => value === card).length, 4);
      }
      assert.equal(round.result.delta.reduce((sum, value) => sum + value, 0), 0);
    }
  }
});
