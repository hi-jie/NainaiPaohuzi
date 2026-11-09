import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [mode] = process.argv.slice(2);
const repo = new URL('../', import.meta.url);
const web = 'android/app/src/main/assets/www/';
const music = web + 'media/audio/music/';
const folder = new URL(music, repo);
const entryPoints = [
  [web + 'index.html', /main\.mjs\?v=\d+(?:-[a-f\d]{12})?/],
  [web + 'js/main.mjs', /music\.mjs\?v=\d+(?:-[a-f\d]{12})?/],
  [web + 'js/audio/music.mjs', /playlist\.mjs\?v=\d+(?:-[a-f\d]{12})?/]
];
const publishPaths = [
  music, ...entryPoints.map(([path]) => path),
  'scripts/update-music.mjs', '.github/workflows/pages.yml', 'README.md'
];

function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

if (mode === '--publish' && git('branch', '--show-current') !== 'main') {
  throw new Error('请切换到 main 分支再发布。');
}

if (mode !== '--playlist-only') {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ogg$/i.test(entry.name)) continue;
    const source = new URL(encodeURIComponent(entry.name), folder);
    const target = new URL(encodeURIComponent(entry.name.slice(0, -4) + '.mp3'), folder);
    if (existsSync(target)) continue;
    execFileSync('ffmpeg', [
      '-v', 'error', '-n', '-i', fileURLToPath(source), '-vn', '-c:a', 'libmp3lame', '-q:a', '3',
      fileURLToPath(target)
    ], { stdio: 'inherit' });
  }
}

const byTitle = new Map();
for (const entry of readdirSync(folder, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(mp3|m4a|ogg|wav)$/i.test(entry.name)) continue;
  const title = entry.name.slice(0, -4);
  if (!byTitle.has(title) || /\.mp3$/i.test(entry.name)) byTitle.set(title, entry.name);
}
const tracks = [...byTitle.values()].sort();
const playlist = `export default ${JSON.stringify(tracks, null, 2)};\n`;
writeFileSync(new URL('playlist.mjs', folder), playlist);

const hash = createHash('sha256').update(playlist);
for (const name of tracks) hash.update(readFileSync(new URL(encodeURIComponent(name), folder)));
const revision = hash.digest('hex').slice(0, 12);
for (const [path, reference] of entryPoints) {
  const file = new URL(path, repo);
  const text = readFileSync(file, 'utf8');
  const updated = text.replace(reference, value => `${value.split('-')[0]}-${revision}`);
  if (updated !== text) writeFileSync(file, updated);
}
console.log(`已更新曲目列表，共 ${tracks.length} 首。`);

if (mode === '--publish') {
  const options = { cwd: repo, stdio: 'inherit' };
  if (git('status', '--porcelain', '--', ...publishPaths)) {
    execFileSync('git', ['add', '--', ...publishPaths], options);
    execFileSync('git', ['commit', '--only', '-m', 'Update background music', '--', ...publishPaths], options);
  }
  execFileSync('git', ['push', 'origin', 'main'], options);
}
