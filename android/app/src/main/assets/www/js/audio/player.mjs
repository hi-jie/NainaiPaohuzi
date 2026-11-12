import { concealedDraw } from '../rules/actions.mjs?v=250';

const numbers = ['yi', 'er', 'san', 'si', 'wu', 'liu', 'qi', 'ba', 'jiu', 'shi'];
const actions = { 吃: 'chi', 碰: 'peng', 偎: 'wei', 提: 'ti', 跑: 'pao', 胡: 'hu', 过: 'guo' };
const effects = {
  button: { file: 'sfx/button.mp3', level: 0.48 },
  select: { file: 'sfx/select.mp3', level: 0.38 },
  shuffle: { file: 'sfx/shuffle.mp3', level: 0.51 },
  card: { file: 'sfx/card.mp3', level: 0.48, duration: 0.23 },
  impact: { file: 'sfx/impact.mp3', level: 0.38, duck: false }
};
const folder = new URL('../../media/audio/', import.meta.url);
const version = new URL(import.meta.url).search;
const soundFiles = [
  ...[...Object.values(actions), 'cpao'].map(name => `hengyang/${name}.wav`),
  ...Object.values(effects).map(({ file }) => file),
  ...numbers.flatMap(number => [`hengyang/x${number}.wav`, `hengyang/d${number}.wav`])
];
const downloads = new Map();
const clips = new Map();
const buffers = new Map();
const failedFiles = new Set();
let soundEnabled = false;
let retryTimer;
let retryDelay = 1000;
let context;
let gain;
let effectGain;
let volume = 1;
let queue = [];
let active;
const activeEffects = new Set();

export function voiceClip({ type, seat, card }, round) {
  const { rules, players } = round;
  if (type === '摸' || type === '出') {
    if (type === '摸' && seat !== 0 && (rules.mode === 'mahjong' || concealedDraw(round))) return;
    return `${card < 10 ? 'x' : 'd'}${numbers[card % 10]}`;
  }
  if (type === '跑' && players[seat].groups.filter(group => group.type === '跑').length > 1) return 'cpao';
  return actions[type];
}

export function unlockSound() {
  if (!context) {
    context = new AudioContext();
    gain = context.createGain();
    gain.gain.value = volume;
    gain.connect(context.destination);
    effectGain = context.createGain();
    effectGain.connect(gain);
    preloadSound();
  }
  if (context.state !== 'running') context.resume().catch(error => console.warn('音效启动失败', error));
}

export function setSoundVolume(value) {
  volume = value;
  if (gain) gain.gain.setTargetAtTime(volume, context.currentTime, 0.015);
}

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  if (enabled) return preloadSound();
  clearTimeout(retryTimer);
  retryTimer = undefined;
  retryDelay = 1000;
  stopSound();
}

async function preloadSound() {
  if (context) {
    await Promise.all(soundFiles.map(loadClip));
  } else {
    await Promise.all(soundFiles.map(downloadClip));
    // The first interaction may have started decoding while the downloads were in flight.
    await Promise.all(clips.values());
  }
}

function retrySound(file) {
  failedFiles.add(file);
  if (!soundEnabled || retryTimer !== undefined) return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    retryDelay = Math.min(retryDelay * 2, 15000);
    preloadSound();
  }, retryDelay);
}

function downloadClip(file) {
  if (!downloads.has(file)) {
    const url = new URL(file, folder);
    url.search = version;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    downloads.set(file, fetch(url, {
      signal: controller.signal, cache: failedFiles.has(file) ? 'reload' : 'default'
    }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    }).catch(error => {
      downloads.delete(file);
      console.warn(`音效下载失败：${file}`, error);
      if (!clips.has(file)) retrySound(file);
    }).finally(() => clearTimeout(timeout)));
  }
  return downloads.get(file);
}

function loadClip(file) {
  if (!clips.has(file)) {
    clips.set(file, downloadClip(file)
      .then(bytes => bytes && context.decodeAudioData(bytes))
      .catch(error => console.warn(`音效解码失败：${file}`, error))
      .then(buffer => {
        downloads.delete(file);
        if (buffer) {
          buffers.set(file, buffer);
          failedFiles.delete(file);
        } else {
          clips.delete(file);
          retrySound(file);
        }
        return buffer;
      }));
  }
  return clips.get(file);
}

function createSource(buffer, level, output) {
  const source = context.createBufferSource();
  const clipGain = context.createGain();
  source.buffer = buffer;
  clipGain.gain.value = level;
  source.connect(clipGain);
  clipGain.connect(output);
  return source;
}

function canPlaySound() {
  return soundEnabled && context && !document.hidden && (window.paohuziForeground ?? document.hasFocus());
}

async function playNext(pending) {
  const buffer = pending[0];
  if (canPlaySound()) {
    await new Promise(resolve => {
      active = createSource(buffer, 1, gain);
      effectGain.gain.value = 0.16;
      active.onended = resolve;
      active.start();
    });
    if (pending !== queue) return;
    active = undefined;
  }
  pending.shift();
  if (pending.length) playNext(pending);
  else effectGain.gain.value = 1;
}

export function playAction(event, round) {
  if (!canPlaySound()) return;
  const name = voiceClip(event, round);
  const buffer = name && buffers.get(`hengyang/${name}.wav`);
  if (event.type === '摸' || event.type === '出') {
    if (buffer) stopVoice();
    playEffect('card', [0], { replace: false });
  }
  if (buffer) {
    queue.push(buffer);
    if (queue.length === 1) playNext(queue);
  }
}

export function playEffect(name, delays = [0], { replace = true } = {}) {
  if (!canPlaySound()) return;
  const { file, level, duration, duck = true } = effects[name];
  const buffer = buffers.get(file);
  if (!buffer) return;
  if (replace) stopEffect();

  const start = context.currentTime;
  let next = start;
  for (const delay of delays) {
    const when = start + delay / 1000;
    if (when < next) continue;
    const source = createSource(buffer, level, duck ? effectGain : gain);
    activeEffects.add(source);
    source.onended = () => activeEffects.delete(source);
    source.start(when, 0, duration);
    next = when + (duration ?? buffer.duration);
  }
}

export function stopEffect() {
  for (const source of activeEffects) source.stop();
  activeEffects.clear();
}

function stopVoice() {
  queue = [];
  active?.stop();
  active = undefined;
  if (effectGain) effectGain.gain.value = 1;
}

export function stopSound() {
  stopEffect();
  stopVoice();
}
