import { readdirSync, writeFileSync } from 'node:fs';

const folder = new URL('../android/app/src/main/assets/www/media/audio/music/', import.meta.url);
const byTitle = new Map();
for (const entry of readdirSync(folder, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(mp3|m4a|ogg|wav)$/i.test(entry.name)) continue;
  const title = entry.name.slice(0, -4);
  if (!byTitle.has(title) || /\.mp3$/i.test(entry.name)) byTitle.set(title, entry.name);
}
const tracks = [...byTitle.values()].sort();

writeFileSync(new URL('playlist.mjs', folder), `export default ${JSON.stringify(tracks, null, 2)};\n`);
