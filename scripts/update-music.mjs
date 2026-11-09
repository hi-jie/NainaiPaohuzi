import { readdirSync, writeFileSync } from 'node:fs';

const folder = new URL('../android/app/src/main/assets/www/media/audio/music/', import.meta.url);
const tracks = readdirSync(folder, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(mp3|m4a|ogg|wav)$/i.test(entry.name))
  .map(entry => entry.name)
  .sort();

writeFileSync(new URL('playlist.mjs', folder), `export default ${JSON.stringify(tracks, null, 2)};\n`);
