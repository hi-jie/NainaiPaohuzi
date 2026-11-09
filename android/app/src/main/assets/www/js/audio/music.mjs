import tracks from '../../media/audio/music/playlist.mjs?v=5-fbe4af7499ad';

const folder = new URL('../../media/audio/music/', import.meta.url);
const audio = new Audio();
audio.volume = 0.45;
let current;

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

export function setMusicPlaying(enabled) {
  if (!enabled) {
    audio.onended = null;
    audio.pause();
  } else if (tracks.length && audio.paused) {
    audio.onended = nextTrack;
    if (!current || audio.ended) nextTrack();
    else play();
  }
}
