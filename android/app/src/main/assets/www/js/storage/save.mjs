import { defaultSettings, presets } from '../rules/presets.mjs?v=124';

const key = 'hengyang-paohuzi-v1';
export function load() {
  const saved = localStorage.getItem(key);
  const data = saved === null ? {} : JSON.parse(saved);
  const scores = Object.fromEntries(Object.keys(presets).map(mode => [mode, data.scores?.[mode] ?? 0]));
  return {
    scores, legacyScore: data.legacyScore ?? data.score ?? 0,
    settings: { ...defaultSettings, ...data.settings }, round: data.round ?? null
  };
}
export function save(data) {
  localStorage.setItem(key, JSON.stringify(data));
}
