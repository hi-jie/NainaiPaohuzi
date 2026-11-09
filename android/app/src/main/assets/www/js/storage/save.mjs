import { defaultSettings } from '../rules/presets.mjs';

const key = 'hengyang-paohuzi-v1';
export function load() {
  const saved = localStorage.getItem(key);
  const data = saved === null ? { score: 0, settings: {} } : JSON.parse(saved);
  return { score: data.score, settings: { ...defaultSettings, ...data.settings } };
}
export function save(data) {
  localStorage.setItem(key, JSON.stringify(data));
}
