export const presets = {
  six: { name: '六胡抢', seats: 4, dealt: 14, minimum: 6 },
  ten: { name: '十胡卡', seats: 3, dealt: 20, minimum: 10 },
  fifteen: { name: '十五胡', seats: 3, dealt: 20, minimum: 15 },
  mahjong: { name: '麻雀牌', seats: 3, dealt: 10 }
};

export const defaultSettings = {
  mode: 'six', oneFiveTen: true, discardHu: true, sound: true, music: true,
  soundVolume: 100, musicVolume: 20, eatCardOnTop: true
};
