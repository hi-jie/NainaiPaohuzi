// Add recorded files here when the Hengyang voice clips are available.
const clips = {};

export function playAction(type) {
  if (type in clips) new Audio(new URL(`../../media/audio/hengyang/${clips[type]}`, import.meta.url)).play();
}
