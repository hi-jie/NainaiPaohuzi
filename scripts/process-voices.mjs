import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, renameSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = fileURLToPath(new URL('../android/app/src/main/assets/www/media/audio/hengyang/', import.meta.url));
const original = join(folder, 'original');
const files = readdirSync(original, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(wav|mp3|m4a|ogg|flac)$/i.test(entry.name))
  .map(entry => entry.name)
  .sort();

// 从原始录音重新处理，避免重复降噪、压缩已处理的人声。
const voiceFilters = [
  'aformat=channel_layouts=mono',
  'highpass=f=85',
  'lowpass=f=8000',
  'afftdn=nr=10:nf=-45',
  // 等到持续的起音再开始，跳过前面的轻声吸气。
  'silenceremove=start_periods=1:start_duration=0.035:start_threshold=-32dB:start_silence=0.065',
  // 倒放后从开头裁剪，只处理字尾，保留录音中间的停顿。
  'areverse',
  'silenceremove=start_periods=1:start_duration=0.045:start_threshold=-35dB:start_silence=0.065',
  'afade=t=in:d=0.012',
  'areverse',
  'equalizer=f=250:t=q:w=1:g=-2',
  'equalizer=f=2600:t=q:w=1:g=2',
  'acompressor=threshold=0.1:ratio=2:attack=10:release=100',
  'alimiter=limit=0.25:attack=5:release=60:level=false'
].join(',');
const target = -14;
const peakLimit = -3.5;
const loudness = `loudnorm=I=${target}:TP=${peakLimit}:LRA=7`;
const trimEnds = { 'guo.wav': 0.81 }; // 「过」的原录音在字尾后接着一段较响的呼气。

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr);
  return result.stderr;
}

const staging = mkdtempSync(join(folder, '.process-'));
try {
  for (const name of files) {
    const source = join(original, name);
    const outputName = name.replace(/\.[^.]+$/, '.wav');
    const end = trimEnds[name];
    const filters = end ? `atrim=end=${end},${voiceFilters}` : voiceFilters;
    const report = ffmpeg([
      '-i', source, '-map', '0:a:0', '-af', `${filters},${loudness}:print_format=json`, '-f', 'null', '-'
    ]);
    const stats = JSON.parse(report.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
    const measured = [
      `measured_I=${stats.input_i}`,
      `measured_TP=${stats.input_tp}`,
      `measured_LRA=${stats.input_lra}`,
      `measured_thresh=${stats.input_thresh}`,
      `offset=${stats.target_offset}`,
      'linear=true'
    ].join(':');
    ffmpeg([
      '-i', source, '-map', '0:a:0', '-af', `${filters},${loudness}:${measured}`,
      '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', '-map_metadata', '-1', join(staging, outputName)
    ]);
    console.log(`已处理 ${name} → ${outputName}`);
  }
  for (const name of readdirSync(staging)) renameSync(join(staging, name), join(folder, name));
} finally {
  for (const name of readdirSync(staging)) unlinkSync(join(staging, name));
  rmdirSync(staging);
}

console.log(`共处理 ${files.length} 段音效，24 kHz 单声道 WAV，目标响度 ${target} LUFS，真峰值上限 ${peakLimit} dBTP。`);
