import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAction } from '../android/app/src/main/assets/www/js/ai/player.mjs';
import { cutDeck, shuffledDeck } from '../android/app/src/main/assets/www/js/game/deck.mjs';
import { Round } from '../android/app/src/main/assets/www/js/game/state-machine.mjs';
import { responses } from '../android/app/src/main/assets/www/js/rules/actions.mjs';
import { huxi, patterns, takeCards, types } from '../android/app/src/main/assets/www/js/rules/cards.mjs';
import { findHu } from '../android/app/src/main/assets/www/js/rules/hu.mjs';
import { defaultSettings, presets } from '../android/app/src/main/assets/www/js/rules/presets.mjs';
import { settle } from '../android/app/src/main/assets/www/js/rules/scoring.mjs';
import { handColumnGroup, moveHandCard, syncHandLayout } from '../android/app/src/main/assets/www/js/ui/hand.mjs';
import { renderHistory, renderTable } from '../android/app/src/main/assets/www/js/ui/table.mjs';

const rules = { ...defaultSettings, ...presets.six, patterns: patterns(false) };
const player = (hand, groups = []) => ({
  hand, groups, discards: [], passedChi: new Set(), passedPeng: new Set(), passedHu: -1
});
const waitingHand = [0, 1, 2, 3, 3, 3, 5, 6, 7, 10, 11, 12, 15, 16];

test('手动理牌可移动同名牌，出牌后保留其它牌的位置', () => {
  const layout = [
    [{ id: 0, card: 0 }, { id: 1, card: 1 }],
    [{ id: 2, card: 1 }, { id: 3, card: 2 }]
  ];
  const moved = moveHandCard(layout, { column: 1, index: 1 }, { column: 0, index: 0 });
  assert.deepEqual(moved.map(column => column.map(({ id }) => id)), [[3, 0, 1], [2]]);
  assert.equal(huxi(handColumnGroup(moved[0], rules.patterns)), 3);
  const synced = syncHandLayout(moved, [0, 1, 2, 9], rules.patterns, new Set([1]));
  assert.deepEqual(synced, [[moved[0][0], moved[0][1]], [moved[1][0]], [{ id: 4, card: 9 }]]);
  const split = moveHandCard(moved, { column: 0, index: 1 }, { column: 1, newColumn: true });
  assert.deepEqual(split.map(column => column.map(({ id }) => id)), [[3, 1], [0], [2]]);
  assert.equal(moveHandCard(moved, { column: 0, index: 0 }, { column: 0, index: 1 }), moved);
});

test('切牌保留整副牌，亮张前后沿用同一手牌', () => {
  const random = () => 0.375;
  const shuffled = shuffledDeck(random);
  const deck = cutDeck(shuffled, random);
  assert.notDeepEqual(deck, shuffled);
  assert.deepEqual([...deck].sort(), [...shuffled].sort());

  for (const mode of Object.keys(presets)) {
    const settings = { ...defaultSettings, mode };
    const round = new Round(settings, 1, random, deck, { deferOpening: true });
    assert.equal(round.phase, undefined);
    assert.equal(round.events.length, 0);
    const beforeOpening = round.players.flatMap(({ hand, groups }) => [...hand, ...groups.flatMap(group => group.cards)]);
    assert.deepEqual([...beforeOpening, ...round.deck, round.opening].sort(), [...deck].sort());
    round.revealOpening();
    assert.deepEqual(round, new Round(settings, 1, random, deck));
  }
});

test('开局动画中的存档恢复后沿用原庄家、手牌和牌墩', () => {
  const round = new Round(defaultSettings, 2, () => 0.375, undefined, { deferOpening: true });
  const restored = Round.fromSave(JSON.parse(JSON.stringify(round.toSave())));
  assert.deepEqual(restored, round);
  round.revealOpening();
  restored.revealOpening();
  assert.deepEqual(restored, round);
});

test('开局按逆时针发牌和提牌，补牌凑成的四张也继续提', () => {
  const hands = [
    [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 4, 5],
    [6, 6, 6, 6, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13],
    [3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 15, 15, 15]
  ];
  const first = hands[0].flatMap((_, index) => [0, 2, 1].map(seat => hands[seat][index])).concat(18, 2, 19);
  const rest = takeCards(types.flatMap(card => [card, card, card, card]), first);
  const round = new Round(defaultSettings, 0, Math.random, first.concat(rest).reverse(), { deferOpening: true });
  assert.deepEqual(round.players.map(({ hand }) => hand), hands.map(hand => [...hand].sort((a, b) => a - b)));
  assert.deepEqual(round.players[0].groups, []);
  assert.doesNotMatch(renderTable(round, 0, null, 'reveal'), /class="landing">\s*<[is]/);
  round.revealOpening();
  assert.equal(round.phase, 'opening-ti');
  assert.equal(round.seat, 0);
  assert.doesNotMatch(renderTable(round, 0), /class="actions hand-actions"/);
  assert.deepEqual(round.options.map(({ type, card, forced }) => [type, card, forced]), [['提', 0, true], ['提', 1, true]]);
  const initialDeckSize = round.deck.length;
  round.act(round.options[0]);
  assert.deepEqual(round.players[0].groups.map(group => group.cards[0]), [0]);
  assert.equal(round.deck.length, initialDeckSize);
  round.act(round.options[0]);
  assert.equal(round.deck.length, initialDeckSize - 1);
  assert.deepEqual(round.options.map(action => action.card), [2]);
  round.act(round.options[0]);
  assert.equal(round.deck.length, initialDeckSize - 2);
  assert.equal(round.seat, 2);
  round.act(round.options[0]);
  assert.deepEqual(round.players[2].groups, [{ type: '提', cards: [15, 15, 15, 15] }]);
  assert.equal(round.seat, 1);
  assert.deepEqual(round.players[1].groups, []);
  round.act(round.options[0]);
  assert.deepEqual(round.players[1].groups, [{ type: '提', cards: [6, 6, 6, 6] }]);
  assert.equal(round.phase, 'discard');
  assert.equal(round.seat, 0);
  assert.ok(round.players[0].hand.includes(18));
});

test('一五十开关改变胡牌拆组', () => {
  const hand = [0, 4, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 3, 3, 3].sort((a, b) => a - b);
  assert.equal(findHu(player(hand), null, false, rules), null);
  const hu = findHu(player(hand), null, false, { ...rules, patterns: patterns(true) });
  assert.equal(hu.huxi, 12);
  assert.equal(huxi({ type: '吃', cards: [0, 4, 9] }), 3);
  assert.equal(huxi({ type: '吃', cards: [10, 14, 19] }), 6);
});

test('关闭放炮胡后只可胡墩上摸出的牌，不限摸牌人', () => {
  const offer = { card: 17, source: 1, kind: 'discard' };
  assert.equal(responses(player(waitingHand), 0, offer, rules).some(action => action.type === '胡'), false);
  assert.equal(responses(player(waitingHand), 0, offer, { ...rules, discardHu: true })[0].type, '胡');
  for (const source of [0, 1]) {
    assert.equal(responses(player(waitingHand), 0, { ...offer, source, kind: 'draw' }, rules)[0].type, '胡');
    assert.equal(responses(player(waitingHand), 0, { ...offer, source, kind: 'opening' }, rules).some(action => action.type === '胡'), false);
  }
});

test('吃和比的牌组互换顺序时只保留一种吃法', () => {
  const round = new Round(defaultSettings, 0);
  round.players = [player([0, 1, 2, 3, 4, 9]), { ...player([]), discards: [2] }, player([])];
  round.reveal(1, 2, 'discard');
  assert.deepEqual(round.options.map(action => action.type), ['吃', '过']);
  round.act(round.options[0]);
  assert.deepEqual(round.players[0].hand, [9]);
  assert.deepEqual(round.players[0].groups.map(group => group.cards), [[0, 1, 2], [2, 3, 4]]);
  assert.deepEqual(round.players[1].discards, []);

  const hand = [0, 1, 1, 2, 3, 3, 4];
  const eats = responses(player(hand), 0, { card: 2, source: 1, kind: 'discard' }, rules)
    .filter(action => action.type === '吃');
  assert.deepEqual(eats.map(action => action.groups), [
    [[0, 1, 2], [1, 2, 3]], [[0, 1, 2], [2, 3, 4]],
    [[1, 2, 3], [1, 2, 3]], [[1, 2, 3], [2, 3, 4]]
  ]);
});

test('吃碰响应未确认时箭头留在出牌者，确认后才指向接牌者', () => {
  for (const accepted of ['碰', '吃', '过']) {
    const round = new Round(defaultSettings, 0);
    round.players = [player([2, 2, 9]), player([0, 1, 8]), { ...player([]), discards: [2] }];
    const arrow = () => Number(renderTable(round, 0).match(/class="turn-arrow to-(\d)"/)[1]);
    round.reveal(2, 2, 'discard');
    assert.equal(round.seat, 0);
    assert.equal(arrow(), 2);

    if (accepted !== '碰') {
      round.act(round.options.find(action => action.type === '过'));
      assert.equal(round.seat, 1);
      assert.equal(arrow(), 2);
    }

    round.act(round.options.find(action => action.type === accepted));
    assert.equal(round.phase, accepted === '过' ? 'draw' : 'discard');
    assert.equal(arrow(), accepted === '碰' ? 0 : 1);
  }
});

test('等吃期间牌只在墩旁，吃完进入落地牌，过后等下一张才进弃牌', () => {
  for (const kind of ['draw', 'discard']) {
    for (const decision of ['吃', '过']) {
      const round = new Round(defaultSettings, 0);
      round.players = [player([0, 1, 8]), player(kind === 'discard' ? [2] : []), player([])];
      round.deck = kind === 'draw' ? [9, 2] : [9];
      if (kind === 'draw') round.waitForDraw(1);
      else round.waitForDiscard(1);
      round.act(round.options[0]);
      assert.match(renderTable(round, 0), /class="landing">\s*<span[^>]*>三</);
      assert.match(renderHistory(round, 1, 'discards'), /共 0 张/);
      round.act(round.options.find(action => action.type === decision));
      assert.match(renderHistory(round, 1, 'discards'), /共 0 张/);
      if (decision === '吃') {
        assert.doesNotMatch(renderTable(round, 0), /class="landing">\s*<span/);
        assert.deepEqual(round.players[0].groups, [{ type: '吃', cards: [0, 1, 2] }]);
      } else {
        assert.match(renderTable(round, 0), /class="landing">\s*<span[^>]*>三</);
        const restored = Round.fromSave(JSON.parse(JSON.stringify(round.toSave())));
        assert.match(renderTable(restored, 0), /class="landing">\s*<span[^>]*>三</);
        assert.match(renderHistory(restored, 1, 'discards'), /共 0 张/);
        round.act(round.options[0]);
        assert.match(renderTable(round, 0), /class="landing">\s*<span[^>]*>十</);
        assert.match(renderHistory(round, 1, 'discards'), /共 1 张/);
      }
    }
  }
});

test('放炮胡只取走本次打出的那一张，先前同名弃牌仍保留', () => {
  const round = new Round({ ...defaultSettings, discardHu: true }, 0);
  round.players = [player(waitingHand), { ...player([]), discards: [17, 17] }, player([])];
  round.reveal(1, 17, 'discard');
  assert.equal(round.options[0].type, '胡');
  round.act(round.options[0]);
  assert.deepEqual(round.players[1].discards, [17]);
  assert.ok(round.result.hu.groups.some(group => group.cards.includes(17)));
  assert.doesNotMatch(renderTable(round, 0), /class="landing">\s*<span/);
});

test('存档恢复当前响应、后续响应和过牌限制', () => {
  const round = new Round(defaultSettings, 0);
  round.players = [player([2, 2, 9]), player([0, 1, 8]), { ...player([]), discards: [2] }];
  round.players[0].passedChi.add(1);
  round.players[0].passedPeng.add(3);
  round.players[0].passedHu = 9;
  round.reveal(2, 2, 'discard');

  const restored = Round.fromSave(JSON.parse(JSON.stringify(round.toSave())));
  assert.deepEqual(restored, round);
  restored.act(restored.options.find(action => action.type === '过'));
  assert.deepEqual([...restored.players[0].passedPeng], [3, 2]);
  assert.equal(restored.seat, 1);
  restored.act(restored.options.find(action => action.type === '吃'));
  assert.deepEqual(restored.players[1].groups, [{ type: '吃', cards: [0, 1, 2] }]);
  assert.equal(restored.phase, 'discard');
});

test('胡牌优先于座次靠前的跑、碰和吃', () => {
  for (const [type, hand] of [['跑', [17, 17, 17]], ['碰', [17, 17]], ['吃', [15, 16]]]) {
    const round = new Round(defaultSettings, 0);
    round.players = [player(waitingHand), player(hand), player([])];
    const offer = { source: 2, card: 17, kind: 'draw' };
    assert.ok(responses(round.players[1], 1, offer, round.rules).some(action => action.type === type));
    round.reveal(offer.source, offer.card, offer.kind);
    assert.equal(round.seat, 0);
    assert.equal(round.options[0].type, '胡');
    round.act(round.options[0]);
    assert.equal(round.result.winner, 0);
  }
});

test('十胡卡正好十胡按十五胡结算，保留实际胡息', () => {
  const ten = { ...rules, ...presets.ten, mode: 'ten' };
  const offer = { source: 0, kind: 'draw' };
  const exactTen = settle(0, offer, { huxi: 10, red: 1 }, ten);
  const fifteen = settle(0, offer, { huxi: 15, red: 1 }, ten);
  assert.equal(exactTen.hu.huxi, 10);
  assert.equal(exactTen.tun, 3);
  assert.deepEqual(exactTen.delta, fifteen.delta);
});

test('十胡卡同一张玖能拆成 10 胡或 13 胡时按 10 胡结算', () => {
  const round = new Round({ ...defaultSettings, mode: 'ten' }, 0);
  const groups = [
    { type: '跑', cards: [5, 5, 5, 5] },
    { type: '吃', cards: [3, 3, 13] },
    { type: '吃', cards: [14, 15, 16] },
    { type: '碰', cards: [17, 17, 17] },
    { type: '碰', cards: [9, 9, 9] }
  ];
  round.players = [player([8, 8, 18, 18], groups), player([]), player([])];
  const thirteen = findHu({ ...round.players[0], passedHu: 10 }, 18, false, round.rules);
  assert.equal(thirteen.huxi, 13);
  assert.deepEqual(settle(0, { source: 1, kind: 'draw' }, thirteen, round.rules).delta, [4, -2, -2]);
  round.reveal(1, 18, 'draw');

  const hu = round.options[0];
  assert.equal(hu.type, '胡');
  assert.equal(hu.hu.huxi, 10);
  assert.deepEqual(hu.hu.groups.slice(-2), [
    { type: '吃', cards: [8, 8, 18] },
    { type: '对', cards: [18, 18] }
  ]);
  round.act(hu);
  assert.equal(round.result.tun, 3);
  assert.deepEqual(round.result.delta, [6, -3, -3]);
});

test('十胡卡同一搜索分支按积分选拆法，并先排除过胡限制挡住的胡息', () => {
  const ten = { ...rules, ...presets.ten, mode: 'ten' };
  const hand = [0, 0, 1, 2, 3, 3, 7, 7, 10, 10, 11, 12, 13, 13];
  const candidate = player(hand, [
    { type: '跑', cards: [5, 5, 5, 5] },
    { type: '碰', cards: [9, 9, 9] }
  ]);
  assert.equal(findHu(candidate, null, false, ten).huxi, 10);
  candidate.passedHu = 10;
  assert.equal(findHu(candidate, null, false, ten).huxi, 13);
  candidate.passedHu = 13;
  assert.equal(findHu(candidate, null, false, ten), null);
});

test('偎牌遇别人打出第四张必须跑，并升级桌面牌', () => {
  const round = new Round(defaultSettings, 0);
  round.players[0] = player([0, 1, 3], [{ type: '偎', cards: [8, 8, 8] }]);
  round.players[1] = { ...player([]), discards: [8] };
  round.players[2] = player([]);
  round.reveal(1, 8, 'discard');
  assert.deepEqual(round.options.map(action => action.type), ['跑']);
  round.act(round.options[0]);
  assert.deepEqual(round.players[0].groups, [{ type: '跑', cards: [8, 8, 8, 8] }]);
  assert.deepEqual(round.players[1].discards, []);
  assert.equal(round.phase, 'discard');
});

test('点炮一家包两份，积分跌到负数仍可开局', () => {
  const result = settle(1, { source: 0, kind: 'discard' }, { huxi: 6, red: 3 }, rules);
  assert.deepEqual(result.delta, [-2, 2, 0]);
  const score = result.delta[0];
  assert.ok(score < 0);
  assert.notEqual(new Round(defaultSettings, result.winner).phase, 'finished');
});

test('三种玩法都能打到胡牌或黄庄', () => {
  for (const mode of Object.keys(presets)) {
    let wins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      let state = seed;
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
      };
      const round = new Round({
        ...defaultSettings, mode, oneFiveTen: seed % 2 === 0, discardHu: seed % 3 === 0
      }, seed % 3, random);
      for (let steps = 0; round.phase !== 'finished'; steps++) {
        assert.ok(steps < 400, `${mode} seed ${seed}`);
        round.act(chooseAction(round));
        const cards = [...round.deck, ...round.players.flatMap(({ hand, groups, discards }) =>
          [...hand, ...groups.flatMap(group => group.cards), ...discards])];
        assert.ok(cards.length === 79 || cards.length === 80);
        assert.ok(types.every(card => cards.filter(value => value === card).length <= 4));
      }
      assert.equal(round.result.delta.reduce((sum, points) => sum + points, 0), 0);
      if (round.result.winner !== null) wins++;
    }
    assert.ok(wins > 0, `${mode} should have winning rounds`);
  }
});
