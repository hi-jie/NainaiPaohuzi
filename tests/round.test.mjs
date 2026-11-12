import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAction } from '../android/app/src/main/assets/www/js/ai/player.mjs';
import { voiceClip } from '../android/app/src/main/assets/www/js/audio/player.mjs';
import { cutDeck, shuffledDeck } from '../android/app/src/main/assets/www/js/game/deck.mjs';
import { Round } from '../android/app/src/main/assets/www/js/game/state-machine.mjs';
import { nextSeat, responses } from '../android/app/src/main/assets/www/js/rules/actions.mjs';
import { huxi, patterns, takeCards, types } from '../android/app/src/main/assets/www/js/rules/cards.mjs';
import { findHu } from '../android/app/src/main/assets/www/js/rules/hu.mjs';
import { defaultSettings, presets } from '../android/app/src/main/assets/www/js/rules/presets.mjs';
import { settle } from '../android/app/src/main/assets/www/js/rules/scoring.mjs';
import { handColumnGroup, moveHandCard, syncHandLayout } from '../android/app/src/main/assets/www/js/ui/hand.mjs';
import { previewEat, renderEatChoices, renderTable } from '../android/app/src/main/assets/www/js/ui/table.mjs';

const paohuziModes = ['six', 'ten', 'fifteen'];
const rules = { ...defaultSettings, ...presets.six, patterns: patterns(false) };
const player = (hand, groups = []) => ({
  hand, groups, discards: [], passedChi: new Set(), passedPeng: new Set(), passedHu: -1,
  ownDiscards: [], chongpao: false
});
const waitingHand = [0, 1, 2, 3, 3, 3, 5, 6, 7, 10, 11, 12, 15, 16];

test('牌桌将自定义昵称作为文字和头像标签显示', () => {
  const round = new Round(defaultSettings, 0, Math.random, undefined, { deferOpening: true });
  const profile = { nickname: '小雨 <家> & "我"', avatar: 'data:image/webp;base64,AAAA' };
  const html = renderTable(round, 0, null, 'dealer', null, profile);
  const name = '小雨 &lt;家&gt; &amp; &quot;我&quot;';
  assert.ok(html.includes(`<span class="seat-name" title="${name}">${name}</span>`));
  assert.ok(html.includes(`src="${profile.avatar}" alt="${name}"`));
  assert.doesNotMatch(html, /<家>/);
});

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

  for (const mode of paohuziModes) {
    const settings = { ...defaultSettings, mode };
    const round = new Round(settings, 1, random, deck, { deferOpening: true });
    assert.equal(round.phase, undefined);
    assert.equal(round.events.length, 0);
    assert.equal(round.players.length, presets[mode].seats);
    assert.ok(round.players.every(({ hand }) => hand.length === presets[mode].dealt));
    assert.equal(round.deck.length, 79 - presets[mode].seats * presets[mode].dealt);
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
    [3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 15, 15, 15],
    [3, 7, 7, 8, 9, 10, 11, 12, 16, 16, 17, 17, 18, 19]
  ];
  const first = hands[0].flatMap((_, index) => [0, 2, 3, 1].map(seat => hands[seat][index])).concat(18, 2, 19);
  const rest = takeCards(types.flatMap(card => [card, card, card, card]), first);
  const round = new Round(defaultSettings, 0, Math.random, first.concat(rest).reverse(), { deferOpening: true });
  assert.deepEqual(round.players.map(({ hand }) => hand), hands.map(hand => [...hand].sort((a, b) => a - b)));
  assert.deepEqual(round.players[0].groups, []);
  assert.match(renderTable(round, 0, null, 'reveal'), /class="landing">[\s\S]*?<span class="card">玖<\/span>/);
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

test('关闭放炮胡仍能胡墩牌和开局亮张', () => {
  const offer = { card: 17, source: 1, kind: 'discard' };
  const disabled = { ...rules, discardHu: false };
  assert.equal(responses(player(waitingHand), 0, offer, disabled).some(action => action.type === '胡'), false);
  assert.equal(responses(player(waitingHand), 0, offer, { ...rules, discardHu: true })[0].type, '胡');
  for (const source of [0, 1]) {
    assert.equal(responses(player(waitingHand), 0, { ...offer, source, kind: 'draw' }, disabled)[0].type, '胡');
    assert.equal(responses(player(waitingHand), 0, { ...offer, source, kind: 'opening' }, disabled)[0].type, '胡');
  }
});

test('三个玩法先亮张，庄家先判天胡，闲家再判地胡', () => {
  for (const mode of paohuziModes) {
    const makeRound = () => {
      const round = new Round({ ...defaultSettings, mode, discardHu: false }, 0, undefined, undefined, { deferOpening: true });
      const dealerHand = waitingHand.slice();
      const otherHand = waitingHand.map(card => card === 3 ? 13 : card);
      if (mode !== 'six') {
        dealerHand.push(4, 4, 4, 14, 14, 14);
        otherHand.push(8, 8, 8, 19, 19, 19);
      }
      round.players[0] = player(dealerHand);
      round.players[2] = player(otherHand);
      round.players[1] = player([18, 18, 18, 18]);
      if (mode === 'six') round.players[3] = player([]);
      round.opening = 17;
      round.revealOpening();
      return round;
    };
    const dealer = makeRound();
    assert.equal(dealer.seat, 0);
    assert.deepEqual(dealer.options.map(({ type }) => type), ['胡', '过']);
    assert.equal(dealer.events.length, 0);
    dealer.act(dealer.options[0]);
    assert.equal(dealer.result.openingName, '天胡');
    const idle = makeRound();
    idle.act(idle.options[1]);
    assert.equal(idle.seat, 2);
    assert.equal(idle.events.length, 0);
    idle.act(idle.options[0]);
    assert.equal(idle.result.openingName, '地胡');
    assert.equal(idle.result.names.some(([name]) => name === '地胡'), mode !== 'six');
    assert.match(renderTable(idle, 0, idle.events.at(-1)), /class="callout"[^>]*>地胡</);
  }
});

test('庄家亮张凑成第三提、闲家起手五坎都直接胡', () => {
  const threeTi = new Round(defaultSettings, 0, undefined, undefined, { deferOpening: true });
  threeTi.players = [player([0, 0, 0, 0, 3, 3, 3, 3, 13, 13, 13, 7, 8, 10]), player([]), player([]), player([])];
  threeTi.opening = 13;
  threeTi.revealOpening();
  assert.equal(threeTi.options[0].forced, true);
  threeTi.act(threeTi.options[0]);
  assert.equal(threeTi.result.hu.special, '三提');
  assert.equal(threeTi.result.hu.huxi, 30);
  assert.deepEqual(threeTi.result.hu.loose, [7, 8, 10]);
  assert.deepEqual(threeTi.events.map(({ type }) => type), ['胡']);

  const fiveKan = new Round({ ...defaultSettings, mode: 'fifteen' }, 0, undefined, undefined, { deferOpening: true });
  const hand = [0, 2, 3, 4, 10].flatMap(card => [card, card, card]).concat(5, 7, 8, 14, 15);
  fiveKan.players = [player([1]), player([]), player(hand)];
  fiveKan.opening = 17;
  fiveKan.revealOpening();
  assert.equal(fiveKan.seat, 2);
  assert.equal(fiveKan.options[0].forced, true);
  fiveKan.act(fiveKan.options[0]);
  assert.equal(fiveKan.result.hu.special, '五坎');
  assert.equal(fiveKan.result.openingName, '地胡');
  assert.deepEqual(fiveKan.players[0].hand, [1, 17]);
  assert.deepEqual(fiveKan.result.hu.loose, [5, 7, 8, 14, 15]);
});

test('十五胡黑胡也要满十五息，旧存档里的低息胡不能确认', () => {
  const black = player([2, 12, 12, 5, 5, 15, 7, 17, 17], [
    { type: '碰', cards: [3, 3, 3] }, { type: '碰', cards: [18, 18, 18] },
    { type: '坎', cards: [0, 0, 0] }, { type: '坎', cards: [4, 4, 4] }
  ]);
  const fifteen = { ...rules, ...presets.fifteen, mode: 'fifteen' };
  const tenHuxi = findHu(black, null, false, { ...fifteen, minimum: 10 });
  assert.equal(tenHuxi.red, 0);
  assert.equal(tenHuxi.huxi, 10);
  assert.equal(findHu(black, null, false, fifteen), null);
  black.groups[0] = { type: '跑', cards: [3, 3, 3, 3] };
  assert.equal(findHu(black, null, false, fifteen).huxi, 15);

  const round = new Round({ ...defaultSettings, mode: 'fifteen' }, 0);
  const saved = JSON.parse(JSON.stringify(round.toSave()));
  delete saved.rules.openMelds;
  Object.assign(saved, { phase: 'after-meld', seat: 0, repeatQuad: true, options: [{ type: '胡', hu: tenHuxi }, { type: '过' }] });
  const restored = Round.fromSave(saved);
  assert.deepEqual(restored.options, [{ type: '摸' }]);
  assert.equal(restored.rules.openMelds, true);
});

test('吃和比的牌组互换顺序时只保留一种吃法', () => {
  const round = new Round(defaultSettings, 0);
  round.players = [player([0, 1, 2, 3, 4, 9]), { ...player([]), discards: [2] }, player([]), player([])];
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

test('第四张同牌不能把原有坎拆散来胡，仍可跑后胡', () => {
  const hand = [0, 0, 1, 1, 1, 2, 2, 6, 6, 9, 9, 13, 14, 15];
  assert.equal(findHu(player(hand), 1, false, rules), null);
  const offer = { card: 1, source: 2, kind: 'draw' };
  assert.deepEqual(responses(player(hand), 0, offer, rules).map(action => action.type), ['跑']);

  const round = new Round(defaultSettings, 0);
  const groups = [[10, 11, 12], [6, 16, 16], [4, 14, 14]].map(cards => ({ type: '吃', cards }));
  round.players = [player([2, 2, 2, 7, 7], groups), player([]), player([]), player([])];
  round.reveal(1, 2, 'draw');
  assert.equal(round.options[0].type, '跑');
  round.act(round.options[0]);
  assert.equal(round.options[0].type, '胡');
  assert.equal(round.options[0].hu.huxi, 12);
});

test('自己打过的同牌不能碰，忍碰后摸到同牌算臭偎', () => {
  const offer = { card: 1, source: 1, kind: 'discard' };
  const ownDiscard = { ...player([1, 1, 8]), ownDiscards: [1] };
  assert.equal(responses(ownDiscard, 0, offer, rules).some(action => action.type === '碰'), false);

  const round = new Round(defaultSettings, 0);
  round.players = [player([1, 1, 8]), { ...player([]), discards: [1] }, player([]), player([])];
  round.reveal(1, 1, 'discard');
  assert.equal(round.options[0].type, '碰');
  const legacy = JSON.parse(JSON.stringify(round.toSave()));
  delete legacy.players[0].ownDiscards;
  legacy.events.unshift({ type: '出', seat: 0, card: 1 });
  assert.equal(Round.fromSave(legacy).options.some(action => action.type === '碰'), false);

  round.act(round.options.find(action => action.type === '过'));
  round.reveal(0, 1, 'draw');
  assert.equal(round.options[0].type, '偎');
  round.act(round.options[0]);
  assert.equal(round.players[0].groups[0].stinky, true);
  assert.match(renderTable(round, 0, round.events.at(-1)), /class="callout" aria-hidden="true">臭偎</);

  const saved = JSON.parse(JSON.stringify(round.toSave()));
  delete saved.players[0].groups[0].stinky;
  assert.equal(Round.fromSave(saved).players[0].groups[0].stinky, true);
});

test('冲跑成功后本局禁吃碰，仍可强制偎或胡，旧存档可恢复限制', () => {
  const round = new Round(defaultSettings, 0);
  round.players = [
    player([8], [{ type: '偎', cards: [1, 1, 1], offeredCard: 1 }]),
    player([1, 2, 3, 5, 5]), player([]), player([])
  ];
  round.record('偎', 0, 1);
  round.waitForDiscard(1);
  round.act(round.options.find(action => action.card === 1));
  assert.equal(round.options[0].type, '跑');
  assert.equal(round.players[1].chongpao, false);
  round.act(round.options[0]);
  assert.equal(round.players[1].chongpao, true);

  const saved = JSON.parse(JSON.stringify(round.toSave()));
  for (const seat of saved.players) {
    delete seat.ownDiscards;
    delete seat.chongpao;
  }
  const restored = Round.fromSave(saved).players[1];
  assert.deepEqual(restored.ownDiscards, [1]);
  assert.equal(restored.chongpao, true);
  for (const [card, type] of [[4, '吃'], [5, '碰']]) {
    const offer = { card, source: 3, kind: 'draw' };
    assert.ok(responses({ ...restored, chongpao: false }, 1, offer, rules).some(action => action.type === type));
    assert.equal(responses(restored, 1, offer, rules).some(action => action.type === type), false);
  }
  assert.equal(responses(restored, 1, { card: 5, source: 1, kind: 'draw' }, rules)[0].type, '偎');
  const huOffer = { card: 17, source: 0, kind: 'draw' };
  assert.equal(responses({ ...restored, hand: waitingHand }, 1, huOffer, rules)[0].type, '胡');
});

test('明提明偎和臭偎高亮顶部牌面，暗提暗偎高亮底部牌背', () => {
  for (const [type, hand, stinky] of [['提', [1, 1, 1, 8], false], ['偎', [1, 1, 8], false], ['偎', [1, 1, 8], true]]) {
    for (const openMelds of [true, false]) {
      const round = new Round({ ...defaultSettings, openMelds }, 0);
      const opponent = player(hand);
      if (stinky) opponent.passedPeng.add(1);
      round.players = [player([]), opponent, player([]), player([])];
      round.deck = [1];
      round.waitForDraw(1);
      round.act(round.options[0]);
      assert.equal(round.options[0].type, type);
      const visible = openMelds || stinky;
      assert.equal(voiceClip(round.events.at(-1), round), visible ? 'xer' : undefined);
      const [, center] = renderTable(round, 0).match(/class="landing">([\s\S]*?)<\/div>/);
      assert.equal(center.includes('class="card back"'), !visible);
      round.act(round.options[0]);
      const [, markup] = renderTable(round, 0).match(new RegExp(`data-meld="${type}"[^>]*>((?:<span class="card[^>]*>[^<]+</span>)+)`));
      const tiles = [...markup.matchAll(/<span class="([^"]+)">([^<]+)<\/span>/g)];
      assert.equal(tiles.filter(([, , face]) => face === '二').length, Number(visible));
      assert.equal(tiles.findIndex(([, classes]) => classes.includes('meld-offered')), visible ? 0 : tiles.length - 1);
      if (type === '偎') {
        round.players[0] = player([1, 2, 3]);
        round.waitForDiscard(0);
        round.act(round.options.find(action => action.card === 1));
        assert.equal(round.options[0].type, '跑');
        round.act(round.options[0]);
        assert.equal(round.players[0].chongpao, openMelds);
      }
    }
  }
});

test('吃法预览将九张排一行，十二张分成两行', () => {
  const groups = [[0, 1, 2], [1, 2, 3], [2, 3, 4], [2, 12, 12]];
  for (const [count, expected] of [[3, [9]], [4, [6, 6]]]) {
    const preview = renderEatChoices([{ type: '吃', groups: groups.slice(0, count) }], 2);
    const rows = preview.split('class="eat-row"').slice(1);
    assert.deepEqual(rows.map(row => [...row.matchAll(/class="card\b/g)].length), expected);
    assert.equal(preview.includes('eat-choice-compact'), count === 4);
    assert.equal([...preview.matchAll(/class="eat-source"/g)].length, 1);
  }
});

test('吃牌高亮先取整组，再取散牌，然后少拆组和少损失胡息', () => {
  const cases = [
    { columns: [[0, 1, 2], [1], [2, 12, 12]], offer: 3, groups: [[1, 2, 3]], ids: [3, 4] },
    { columns: [[1, 11, 11], [2, 12, 12], [0, 1, 2]], offer: 3, groups: [[1, 2, 3]], ids: [7, 8] },
    { columns: [[0, 1, 2], [1, 11, 11], [6]], offer: 9, groups: [[1, 6, 9]], ids: [3, 6] },
    { columns: [[0, 1, 2], [1, 3, 9], [8]], offer: 2, groups: [[0, 1, 2], [1, 2, 3]], ids: [0, 1, 2, 3, 4] },
    { columns: [[0], [0, 1, 2], [1, 3, 9]], offer: 2, groups: [[0, 1, 2], [1, 2, 3]], ids: [1, 2, 3, 4, 5] }
  ];
  for (const { columns, offer, groups, ids } of cases) {
    let nextId = 0;
    const layout = columns.map(column => column.map(card => ({ id: nextId++, card })));
    const hand = columns.flat();
    const action = responses(player(hand), 0, { card: offer, source: 1, kind: 'discard' }, rules)
      .find(option => option.type === '吃' && JSON.stringify(option.groups) === JSON.stringify(groups));
    assert.ok(action);
    const highlighted = new Set();
    const table = {
      querySelectorAll: () => layout.flat().map(({ id }) => ({
        dataset: { handCard: String(id) },
        classList: { toggle: (_, active) => active ? highlighted.add(id) : highlighted.delete(id) }
      }))
    };
    previewEat(table, action, layout, rules.patterns);
    assert.deepEqual([...highlighted], ids);

    const remaining = takeCards(hand, [...action.cards, ...groups.slice(1).flat()]);
    const synced = syncHandLayout(layout, remaining, rules.patterns, highlighted);
    assert.deepEqual(synced.flat(), layout.flat().filter(({ id }) => !highlighted.has(id)));
    previewEat(table);
    assert.equal(highlighted.size, 0);
  }
});

test('吃碰响应未确认时头像和箭头留在出牌者，确认后同步切换', () => {
  for (const accepted of ['碰', '吃', '过']) {
    const round = new Round(defaultSettings, 0);
    round.players = [player([2, 2, 9]), player([0, 1, 8]), player([]), { ...player([]), discards: [2] }];
    const assertTurn = seat => {
      const html = renderTable(round, 0);
      assert.equal(Number(html.match(/class="turn-arrow to-(\d)"/)[1]), seat);
      assert.deepEqual([...html.matchAll(/class="seat seat-(\d) active\b/g)].map(match => Number(match[1])), [seat]);
    };
    round.reveal(3, 2, 'discard');
    assert.equal(round.seat, 0);
    assertTurn(3);

    if (accepted !== '碰') {
      round.act(round.options.find(action => action.type === '过'));
      assert.equal(round.seat, 1);
      assertTurn(3);
    }

    round.act(round.options.find(action => action.type === accepted));
    assert.equal(round.phase, accepted === '过' ? 'draw' : 'discard');
    assertTurn(accepted === '碰' ? 0 : 1);
  }
});

test('可以先报吃，高优先级的碰截走牌或过后自动执行吃', () => {
  for (const opponentTakes of [true, false]) {
    const round = new Round(defaultSettings, 0);
    round.players = [player([0, 1, 8]), { ...player([]), discards: [2] }, player([2, 2, 9]), player([])];
    round.reveal(1, 2, 'discard');
    assert.equal(round.seat, 2);
    assert.match(renderTable(round, 0), /data-command="choose-eat"/);
    round.submitPlayerResponse(round.playerResponses.find(action => action.type === '吃'));
    assert.equal(round.pendingPlayerAction, null);
    assert.deepEqual(round.players[0].hand, [0, 1, 8]);
    assert.match(renderTable(round, 0), /已选吃，等待其他玩家/);

    const restored = Round.fromSave(JSON.parse(JSON.stringify(round.toSave())));
    restored.act(restored.options.find(action => action.type === (opponentTakes ? '碰' : '过')));
    if (!opponentTakes) {
      assert.equal(restored.pendingPlayerAction.type, '吃');
      restored.act(restored.pendingPlayerAction);
    }
    assert.equal(restored.phase, 'discard');
    assert.equal(restored.seat, opponentTakes ? 2 : 0);
    assert.deepEqual(restored.players[1].discards, []);
    assert.equal(restored.pendingResponse, undefined);
    assert.equal(restored.players[0].passedChi.has(2), false);
    assert.equal(restored.players[restored.seat].groups.length, 1);
  }
});

test('同一玩家能碰也能吃时可任选，点一次过同时放弃两种动作', () => {
  for (const type of ['碰', '吃', '过']) {
    const round = new Round(defaultSettings, 0);
    round.players = [player([0, 1, 2, 2, 3, 4, 9, 12, 12]), { ...player([]), discards: [2] }, player([]), player([])];
    round.reveal(1, 2, 'discard');
    const types = new Set(round.playerResponses.map(action => action.type));
    assert.deepEqual(types, new Set(['碰', '吃', '过']));
    round.submitPlayerResponse(round.playerResponses.find(action => action.type === type));
    if (type === '吃') {
      assert.equal(round.pendingPlayerAction.type, '过');
      round.act(round.pendingPlayerAction);
    }
    assert.equal(round.pendingPlayerAction.type, type);
    round.act(round.pendingPlayerAction);
    if (type === '过') {
      assert.deepEqual(round.players[0].groups, []);
      assert.equal(round.phase, 'draw');
      assert.equal(round.playerResponses, null);
    } else assert.equal(round.players[0].groups[0].type, type);
    assert.equal(round.players[0].passedPeng.has(2), type !== '碰');
    assert.equal(round.players[0].passedChi.has(2), type === '过');
  }
});

test('对家的暗偎保密，明偎时可先选动作并由强制偎截走', () => {
  for (const openMelds of [false, true]) {
    const round = new Round({ ...defaultSettings, openMelds }, 0);
    round.players = [player([0, 1, 8]), player([2, 2, 9]), player([]), player([])];
    round.reveal(1, 2, 'draw');
    assert.equal(round.options[0].type, '偎');
    assert.equal(round.playerResponses.some(action => action.type === '吃'), openMelds);
    if (openMelds) round.submitPlayerResponse(round.playerResponses.find(action => action.type === '吃'));
    round.act(round.options[0]);
    assert.equal(round.pendingResponse, undefined);
    assert.deepEqual(round.players[0].hand, [0, 1, 8]);
  }
});

test('等吃期间牌只在墩旁，吃完进入落地牌，过后等下一张才进弃牌', () => {
  const assertDiscardCount = (round, count) => {
    const [seat] = renderTable(round, 0).match(/<section class="seat seat-1\b[^>]*>[\s\S]*?<\/section>/);
    assert.ok(seat.includes(`aria-label="对家的弃牌，${count}张"`));
  };
  for (const kind of ['draw', 'discard']) {
    for (const decision of ['吃', '过']) {
      const round = new Round(defaultSettings, 0);
      round.players = [player([0, 1, 8]), player(kind === 'discard' ? [2] : []), player([]), player([])];
      round.deck = kind === 'draw' ? [7, 9, 2] : [7, 9];
      if (kind === 'draw') round.waitForDraw(1);
      else round.waitForDiscard(1);
      round.act(round.options[0]);
      assert.match(renderTable(round, 0), /class="landing">\s*<span[^>]*>三</);
      assertDiscardCount(round, 0);
      round.act(round.options.find(action => action.type === decision));
      assertDiscardCount(round, 0);
      if (decision === '吃') {
        assert.doesNotMatch(renderTable(round, 0), /class="landing">\s*<span/);
        assert.deepEqual(round.players[0].groups, [{ type: '吃', cards: [0, 1, 2], offeredCard: 2 }]);
      } else {
        assert.match(renderTable(round, 0), /class="landing">\s*<span[^>]*>三</);
        const restored = Round.fromSave(JSON.parse(JSON.stringify(round.toSave())));
        assert.match(renderTable(restored, 0), /class="landing">\s*<span[^>]*>三</);
        assertDiscardCount(restored, 0);
        round.act(round.options[0]);
        assert.match(renderTable(round, 0), /class="landing">\s*<span[^>]*>十</);
        assertDiscardCount(round, 1);
      }
    }
  }
});

test('落地牌按牌序显示，只有吃进的牌加边框标记', () => {
  const round = new Round(defaultSettings, 0);
  round.players = [player([0, 1, 2, 6, 8, 9]), { ...player([]), discards: [1] }, player([]), player([])];
  round.reveal(1, 1, 'discard');
  round.act(round.options.find(action => action.type === '吃' && action.groups[0][0] === 0));
  const restored = Round.fromSave(JSON.parse(JSON.stringify(round.toSave())));
  const groups = restored.players[0].groups;
  assert.deepEqual(groups.map(huxi), [3, 3]);

  const displayOrder = current => [...renderTable(current, 0).matchAll(/data-meld="吃"[^>]*>((?:<span class="card[^>]*>[^<]+<\/span>)+)/g)]
    .map(([, group]) => [...group.matchAll(/class="([^"]+)">([^<>]+)<\/span>/g)]
      .map(([, classes, card]) => classes.includes('meld-offered') ? `*${card}` : card));
  assert.deepEqual(displayOrder(round), [['一', '*二', '三'], ['二', '七', '十']]);
  restored.rules.eatCardOnTop = true;
  assert.deepEqual(displayOrder(restored), displayOrder(round));
  delete groups[0].offeredCard;
  assert.deepEqual(displayOrder(restored), [['一', '二', '三'], ['二', '七', '十']]);

  round.players = [player([1, 8, 11]), { ...player([]), discards: [1] }, player([]), player([])];
  round.reveal(1, 1, 'discard');
  round.act(round.options.find(action => action.type === '吃' && action.groups[0].includes(11)));
  assert.deepEqual(displayOrder(round), [['二', '*二', '贰']]);
});

test('碰、偎、跑、提只标记一张新进牌，旧存档也可恢复标记', () => {
  for (const [type, copies, seat, source, kind, openMelds = true] of [
    ['碰', 2, 0, 1, 'discard'], ['偎', 2, 1, 1, 'draw'],
    ['跑', 3, 0, 1, 'discard'], ['提', 3, 0, 0, 'draw'], ['提', 3, 0, 0, 'draw', false]
  ]) {
    const round = new Round({ ...defaultSettings, openMelds }, 0);
    round.players = Array.from({ length: 4 }, () => player([]));
    round.players[seat].hand = [...Array(copies).fill(1), 8];
    if (kind === 'discard') round.players[source].discards.push(1);
    round.reveal(source, 1, kind);
    round.act(round.options.find(action => action.type === type));

    const html = renderTable(round, 0);
    const [, markup] = html.match(new RegExp(`data-meld="${type}"[^>]*>((?:<span class="card[^>]*>[^<]+</span>)+)`));
    const expected = '<span class="card red meld-offered">二</span>';
    const highlighted = openMelds && (type === '偎' || type === '提') ? markup.startsWith(expected) : markup.endsWith(expected);
    assert.ok(highlighted);
    assert.equal([...html.matchAll(/meld-offered/g)].length, 1);

    const saved = JSON.parse(JSON.stringify(round.toSave()));
    delete saved.players[seat].groups[0].offeredCard;
    assert.ok(renderTable(Round.fromSave(saved), 0).includes(expected));
  }
});

test('放炮胡只取走本次打出的那一张，先前同名弃牌仍保留', () => {
  const round = new Round({ ...defaultSettings, discardHu: true }, 0);
  round.players = [player(waitingHand), { ...player([]), discards: [17, 17] }, player([]), player([])];
  round.reveal(1, 17, 'discard');
  assert.equal(round.options[0].type, '胡');
  round.act(round.options[0]);
  assert.deepEqual(round.players[1].discards, [17]);
  assert.ok(round.result.hu.groups.some(group => group.cards.includes(17)));
  assert.doesNotMatch(renderTable(round, 0), /class="landing">\s*<span/);
  round.deck = [0, 1];
  const reveal = renderTable(round, 0, round.events.at(-1));
  assert.match(reveal, /class="callout"[^>]*>胡</);
  assert.equal([...reveal.matchAll(/class="revealed-hand"/g)].length, 3);
  const [winner] = reveal.match(/<section class="seat seat-0 winner">[\s\S]*?<\/section>/);
  assert.deepEqual([...winner.matchAll(/data-cards="([^"]+)"/g)].map(([, cards]) => cards),
    round.result.hu.groups.map(({ cards }) => cards.join(' ')));
  const [, deck] = reveal.match(/class="revealed-deck"[^>]*>(.*?)<\/div>/);
  assert.deepEqual([...deck.matchAll(/class="card[^"]*">([^<]+)</g)].map(([, card]) => card), ['二', '一']);
  assert.doesNotMatch(reveal, /class="(?:hand|settlement)"/);
});

test('最后一张牌无人取用时自动黄庄，下家接庄并亮牌', () => {
  const round = new Round(defaultSettings, 0);
  round.players = [player([0]), player([1], [{ type: '偎', cards: [4, 4, 4] }]), player([2]), player([3])];
  round.deck = [9];
  round.waitForDraw(3);
  round.act(round.options[0]);

  assert.equal(round.phase, 'last-draw');
  assert.deepEqual(round.players[3].discards, []);
  const holding = renderTable(round, 0, round.events.at(-1));
  assert.match(holding, /class="landing">\s*<span class="card red">十<\/span>/);
  assert.doesNotMatch(holding, /class="revealed-hand"|data-action=/);
  const restored = Round.fromSave(JSON.parse(JSON.stringify(round.toSave())));
  assert.deepEqual(restored, round);
  round.act(round.options[0]);

  assert.equal(round.phase, 'finished');
  assert.deepEqual(round.options, []);
  assert.deepEqual(round.result, { winner: null, delta: [0, 0, 0, 0], nextDealer: 2 });
  assert.deepEqual(round.players[3].discards, [9]);
  const table = renderTable(round, 0);
  assert.equal([...table.matchAll(/class="reveal-slot"/g)].length, 4);
  assert.doesNotMatch(table, /class="revealed-deck"/);
  assert.match(table, /class="meld reveal-meld" data-meld="偎"/);
  assert.doesNotMatch(table, /class="seat-backs"|data-select-card/);
});

test('空墩仍允许吃牌和后续出牌，待动作结束才自动黄庄', () => {
  const round = new Round(defaultSettings, 3);
  round.players = [player([0, 1, 8]), player([]), player([]), player([])];
  round.deck = [2];
  round.waitForDraw(1);
  round.act(round.options[0]);
  assert.equal(round.phase, 'response');
  assert.equal(round.deck.length, 0);
  round.act(round.options.find(action => action.type === '吃'));
  assert.equal(round.phase, 'discard');
  round.act(round.options[0]);
  assert.equal(round.phase, 'finished');
  assert.deepEqual(round.result, { winner: null, delta: [0, 0, 0, 0], nextDealer: 1 });
});

test('存档恢复当前响应、后续响应和过牌限制', () => {
  const round = new Round(defaultSettings, 0);
  round.players = [player([2, 2, 9]), player([0, 1, 8]), player([]), { ...player([]), discards: [2] }];
  round.players[0].passedChi.add(1);
  round.players[0].passedPeng.add(3);
  round.players[0].passedHu = 9;
  round.reveal(3, 2, 'discard');

  const restored = Round.fromSave(JSON.parse(JSON.stringify(round.toSave())));
  assert.deepEqual(restored, round);
  restored.act(restored.options.find(action => action.type === '过'));
  assert.deepEqual([...restored.players[0].passedPeng], [3, 2]);
  assert.equal(restored.seat, 1);
  restored.act(restored.options.find(action => action.type === '吃'));
  assert.deepEqual(restored.players[1].groups, [{ type: '吃', cards: [0, 1, 2], offeredCard: 2 }]);
  assert.equal(restored.phase, 'discard');
});

test('三种玩法的跑和碰都优先于座次靠前的吃', () => {
  for (const mode of paohuziModes) {
    for (const [action, hand] of [['碰', [2, 2, 9]], ['跑', [2, 2, 2, 9]]]) {
      const round = new Round({ ...defaultSettings, mode }, 0);
      const source = round.players.length - 1;
      round.players = round.players.map(() => player([]));
      round.players[0] = player(hand);
      round.players[1] = player([0, 1, 8]);
      round.players[source] = { ...player([]), discards: [2] };
      round.reveal(source, 2, 'discard');
      assert.equal(round.seat, 0);
      assert.equal(round.options[0].type, action);
      assert.equal(round.queue[0].choices[0].type, '吃');
    }
  }
});

test('六胡抢按囤计分，十胡卡和十五胡自摸不另加倍', () => {
  for (const mode of paohuziModes) {
    const preset = presets[mode];
    const settings = { ...rules, ...preset, mode };
    const hu = { huxi: 15, red: 1 };
    const selfDraw = settle(0, { kind: 'draw', source: 0 }, hu, settings);
    const otherDraw = settle(0, { kind: 'draw', source: 1 }, hu, settings);
    assert.deepEqual(selfDraw.delta, otherDraw.delta);
    const unit = (mode === 'six' ? 1 : 3) * selfDraw.tun;
    assert.deepEqual(selfDraw.delta, [(preset.seats - 1) * unit, ...Array(preset.seats - 1).fill(-unit)]);
    assert.deepEqual(selfDraw.names, mode === 'six' ? [] : [['点胡', 3], ['自摸', 1]]);
  }
});

test('十胡卡和十五胡的十到十二红同乘二，首张弃牌不算地胡', () => {
  for (const mode of ['ten', 'fifteen']) {
    const settings = { ...rules, ...presets[mode], mode };
    for (const red of [10, 11, 12]) {
      const result = settle(0, { kind: 'discard', source: 1, first: true }, { huxi: 15, red }, settings);
      assert.deepEqual(result.names, [['十红', 2]]);
      assert.deepEqual(result.delta, [4 * result.tun, -4 * result.tun, 0]);
    }
  }
});

test('胡牌优先于座次靠前的跑、碰和吃', () => {
  for (const [type, hand] of [['跑', [17, 17, 17]], ['碰', [17, 17]], ['吃', [15, 16]]]) {
    const round = new Round(defaultSettings, 0);
    round.players = [player(waitingHand), player(hand), player([]), player([])];
    const offer = { source: 3, card: 17, kind: 'draw' };
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
  round.players[3] = player([]);
  round.reveal(1, 8, 'discard');
  assert.deepEqual(round.options.map(action => action.type), ['跑']);
  round.act(round.options[0]);
  assert.deepEqual(round.players[0].groups, [{ type: '跑', cards: [8, 8, 8, 8], offeredCard: 8 }]);
  assert.deepEqual(round.players[1].discards, []);
  assert.equal(round.phase, 'discard');
});

test('四人六胡抢点炮一家包三份，积分跌到负数仍可开局', () => {
  const result = settle(1, { source: 0, kind: 'discard' }, { huxi: 6, red: 3 }, rules);
  assert.deepEqual(result.delta, [-3, 3, 0, 0]);
  const score = result.delta[0];
  assert.ok(score < 0);
  assert.notEqual(new Round(defaultSettings, result.winner).phase, 'finished');
});

test('三种玩法都能打到胡牌或黄庄', () => {
  for (const mode of paohuziModes) {
    let wins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      let state = seed;
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
      };
      const round = new Round({
        ...defaultSettings, mode, oneFiveTen: seed % 2 === 0, discardHu: seed % 3 === 0, openMelds: seed % 2 === 1
      }, seed % presets[mode].seats, random);
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

test('四人六胡抢逆时针轮转，上家可吃，旧三人存档仍可恢复', () => {
  const round = new Round(defaultSettings, 3, () => 0.375, undefined, { deferOpening: true });
  assert.equal(round.deck.length, 23);
  assert.match(renderTable(round, 0, null, 'deal'), /class="seat seat-3"/);
  assert.deepEqual([0, 2, 3, 1].map(seat => nextSeat(seat, round.rules.seats)), [2, 3, 1, 0]);

  const state = round.toSave();
  delete state.rules.seats;
  state.players.pop();
  state.dealer = 0;
  delete state.openingHand;
  Object.assign(state, { deck: [], phase: 'draw', seat: 1, options: [{ type: '摸' }] });
  const restored = Round.fromSave(state);
  assert.equal(restored.phase, 'finished');
  assert.deepEqual(restored.result, { winner: null, delta: [0, 0, 0], nextDealer: 2 });
});
