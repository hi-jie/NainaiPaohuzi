const numbers = ['yi', 'er', 'san', 'si', 'wu', 'liu', 'qi', 'ba', 'jiu', 'shi'];
const actions = { 吃: 'chi', 碰: 'peng', 偎: 'wei', 提: 'ti', 跑: 'pao', 胡: 'hu', 过: 'guo' };
const effects = {
  button: { file: 'sfx/button.mp3', level: 0.48 },
  select: { file: 'sfx/select-button.mp3', level: 0.38 },
  shuffle: { file: 'sfx/shuffling-deck-of-cards.mp3', level: 0.51 },
  card: { file: 'sfx/taking-playing-card.mp3', level: 0.48, duration: 0.23 },
  impact: { file: 'sfx/fast-body-fall-impact.mp3', level: 0.5, offset: 0.12, duration: 0.52, duck: false }
};
const folder = new URL('../../media/audio/', import.meta.url);
const version = new URL(import.meta.url).search;
const clips = new Map();
let context;
let gain;
let effectGain;
let volume = 1;
let queue = [];
let active;
const activeEffects = new Set();
let effectRequest = 0;

export function voiceClip({ type, seat, card }, { rules, players }) {
  if (type === '摸' || type === '出') {
    if (type === '摸' && rules.mode === 'mahjong' && seat !== 0) return;
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
    for (const { file } of Object.values(effects)) loadClip(file);
  }
  if (context.state !== 'running') context.resume().catch(error => console.warn('音效启动失败', error));
}

export function setSoundVolume(value) {
  volume = value;
  if (gain) gain.gain.setTargetAtTime(volume, context.currentTime, 0.015);
}

function loadClip(file) {
  if (!clips.has(file)) {
    const url = new URL(file, folder);
    url.search = version;
    clips.set(file, fetch(url)
      .then(response => response.arrayBuffer())
      .then(bytes => context.decodeAudioData(bytes))
      .catch(error => console.warn(`音效加载失败：${file}`, error)));
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
  return context && !document.hidden && (window.paohuziForeground ?? document.hasFocus());
}

async function playNext(pending) {
  const { clip, level, duration } = pending[0];
  const buffer = await clip;
  if (pending !== queue) return;
  if (buffer) {
    await new Promise(resolve => {
      active = createSource(buffer, level, gain);
      effectGain.gain.value = 0.16;
      active.onended = resolve;
      active.start(0, 0, duration);
    });
    if (pending !== queue) return;
    active = undefined;
  }
  pending.shift();
  if (pending.length) playNext(pending);
  else effectGain.gain.value = 1;
}

function queueSound({ file, level = 1, duration }) {
  queue.push({ clip: loadClip(file), level, duration });
  if (queue.length === 1) playNext(queue);
}

export function playAction(event, round) {
  if (!canPlaySound()) return;
  if (event.type === '摸' || event.type === '出') queueSound(effects.card);
  const name = voiceClip(event, round);
  if (name) queueSound({ file: `hengyang/${name}.wav` });
}

export async function playEffect(name, delays = [0]) {
  if (!canPlaySound()) return;
  stopEffect();
  const request = effectRequest;
  const { file, level, offset = 0, duration, duck = true } = effects[name];
  const buffer = await loadClip(file);
  if (request !== effectRequest || !buffer || !canPlaySound()) return;

  const start = context.currentTime;
  let next = start;
  for (const delay of delays) {
    const when = start + delay / 1000;
    if (when < next) continue;
    const source = createSource(buffer, level, duck ? effectGain : gain);
    activeEffects.add(source);
    source.onended = () => activeEffects.delete(source);
    source.start(when, offset, duration);
    next = when + (duration ?? buffer.duration);
  }
}

export function stopEffect() {
  effectRequest++;
  for (const source of activeEffects) source.stop();
  activeEffects.clear();
}

export function stopSound() {
  stopEffect();
  queue = [];
  active?.stop();
  active = undefined;
  if (effectGain) effectGain.gain.value = 1;
}
