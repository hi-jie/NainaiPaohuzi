import { defaultSettings, presets } from '../rules/presets.mjs?v=175';

const key = 'hengyang-paohuzi-v1';
export function load() {
  const saved = localStorage.getItem(key);
  const data = saved === null ? {} : JSON.parse(saved);
  const round = data.round ?? null;
  if (round?.state && 'opponents' in round.state) {
    delete round.state.opponents;
    save(data);
  }
  const scores = Object.fromEntries(Object.keys(presets).map(mode => [mode, data.scores?.[mode] ?? 0]));
  return {
    scores,
    settings: { ...defaultSettings, ...data.settings }, round
  };
}
export function save(data) {
  localStorage.setItem(key, JSON.stringify(data));
}
