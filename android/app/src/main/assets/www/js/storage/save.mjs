import { defaultSettings, presets } from '../rules/presets.mjs?v=272';

const key = 'hengyang-paohuzi-v1';
export const roundSaveVersion = 1;
export const defaultNickname = '我';

export function load() {
  const saved = localStorage.getItem(key);
  const data = saved === null ? {} : JSON.parse(saved);
  const scores = Object.fromEntries(Object.keys(presets).map(mode => [mode, data.scores?.[mode] ?? 0]));
  return {
    scores,
    settings: { ...defaultSettings, ...data.settings },
    profile: { nickname: defaultNickname, avatar: null, ...data.profile },
    round: data.round?.version === roundSaveVersion ? data.round : null
  };
}
export function save(data) {
  localStorage.setItem(key, JSON.stringify(data));
}
