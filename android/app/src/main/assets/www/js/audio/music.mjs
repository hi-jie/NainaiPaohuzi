import tracks from '../../media/audio/music/playlist.mjs?v=5-cbe0bee8a6aa';

const folder = new URL('../../media/audio/music/', import.meta.url);
const audio = new Audio();
audio.preload = 'none';
let current;
let enabled = false;

function play() {
  audio.play().catch(error => {
    if (!['AbortError', 'NotAllowedError'].includes(error.name)) console.warn('背景音乐播放失败', error);
  });
}

function nextTrack() {
  const choices = tracks.length > 1 ? tracks.filter(track => track !== current) : tracks;
  current = choices[Math.floor(Math.random() * choices.length)];
  const url = new URL(encodeURIComponent(current), folder);
  url.search = new URL(import.meta.url).search;
  audio.src = url;
  play();
}

function syncPlayback() {
  const focused = window.paohuziForeground ?? document.hasFocus();
  if (!enabled || document.hidden || !focused) {
    audio.pause();
  } else if (tracks.length) {
    if (!current || audio.ended) nextTrack();
    else if (audio.paused) play();
  }
}

audio.addEventListener('ended', syncPlayback);
document.addEventListener('visibilitychange', syncPlayback);
for (const event of ['focus', 'blur', 'pageshow', 'paohuzi-foreground-change']) {
  window.addEventListener(event, syncPlayback);
}
window.addEventListener('pagehide', () => audio.pause());

export function setMusicPlaying(playing) {
  enabled = playing;
  syncPlayback();
}

export function setMusicVolume(volume) {
  audio.volume = volume;
}
