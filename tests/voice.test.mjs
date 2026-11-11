import assert from 'node:assert/strict';
import { accessSync } from 'node:fs';
import test from 'node:test';
import { voiceClip } from '../android/app/src/main/assets/www/js/audio/player.mjs';
import { types } from '../android/app/src/main/assets/www/js/rules/cards.mjs';

const folder = new URL('../android/app/src/main/assets/www/media/audio/hengyang/', import.meta.url);
const round = { rules: { mode: 'six' } };

test('摸牌和出牌读同一牌面，区分大小字并覆盖全部录音', () => {
  const names = types.map(card => {
    const name = voiceClip({ type: '出', seat: 1, card }, round);
    assert.equal(voiceClip({ type: '摸', seat: 1, card }, round), name);
    accessSync(new URL(`${name}.wav`, folder));
    return name;
  });
  assert.equal(new Set(names).size, 20);
  assert.equal(names[0], 'xyi');
  assert.equal(names[10], 'dyi');
});

test('动作音效与各家本局跑牌次数对应，提不计作跑', () => {
  const players = [{ groups: [{ type: '提' }, { type: '跑' }] }, { groups: [{ type: '跑' }, { type: '跑' }] }];
  for (const [type, name] of [['吃', 'chi'], ['碰', 'peng'], ['偎', 'wei'], ['提', 'ti'], ['胡', 'hu'], ['跑', 'pao'], ['过', 'guo']]) {
    assert.equal(voiceClip({ type, seat: 0 }, { ...round, players }), name);
    accessSync(new URL(`${name}.wav`, folder));
  }
  assert.equal(voiceClip({ type: '跑', seat: 1 }, { ...round, players }), 'cpao');
  accessSync(new URL('cpao.wav', folder));
});

test('麻雀牌报我摸的牌和所有人的出牌，保留对家暗手', () => {
  const mahjong = { rules: { mode: 'mahjong' } };
  assert.equal(voiceClip({ type: '摸', seat: 0, card: 10 }, mahjong), 'dyi');
  assert.equal(voiceClip({ type: '摸', seat: 1, card: 10 }, mahjong), undefined);
  assert.equal(voiceClip({ type: '出', seat: 1, card: 10 }, mahjong), 'dyi');
});
