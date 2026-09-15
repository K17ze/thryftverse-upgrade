/**
 * Smoke: verifies the rendered-composition HLS ladder leg on real ffmpeg.
 * Runs buildHlsArgs + runFfmpeg on a previously rendered MP4 and inspects
 * the generated master playlist, rendition playlists and fMP4 segments.
 *
 * Usage: npx tsx scripts/smoke-rendered-hls.ts [source.mp4]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildHlsArgs, HLS_RENDITIONS } from '../src/lib/media/hlsPackager.js';
import { runFfmpeg } from '../src/lib/media/ffmpeg.js';

const source = process.argv[2] ?? '/tmp/thryft-kf-smoke/rendered.mp4';
const hasAudio = process.argv[3] !== 'noaudio';
const outDir = process.argv[4] ?? '/tmp/thryft-kf-smoke/hls';

if (!existsSync(source)) {
  console.error(`source not found: ${source}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const args = buildHlsArgs(source, outDir, { hasAudio });
console.log('hls args:', args.join(' '));
await runFfmpeg(args, undefined, { timeoutMs: 60_000 });

const files = readdirSync(outDir);
console.log('outputs:', files);

const master = files.find((f) => f === 'master.m3u8');
if (!master) throw new Error('master.m3u8 missing');
const masterText = readFileSync(join(outDir, master), 'utf8');
console.log('--- master.m3u8 ---\n' + masterText);

const variantCount = (masterText.match(/#EXT-X-STREAM-INF/g) ?? []).length;
if (variantCount < 1) throw new Error('no variants in master playlist');
console.log(`variants: ${variantCount} (configured renditions: ${HLS_RENDITIONS.length})`);

let segmentCount = 0;
const playlists = files.filter((f) => f.startsWith('stream_'));
for (const dir of playlists) {
  const entries = readdirSync(join(outDir, dir));
  const segs = entries.filter((f) => f.endsWith('.m4s'));
  segmentCount += segs.length;
  const pl = entries.find((f) => f.endsWith('.m3u8'));
  if (!pl) throw new Error(`${dir} missing playlist`);
  const text = readFileSync(join(outDir, dir, pl), 'utf8');
  if (!text.includes('#EXT-X-MAP')) throw new Error(`${dir}/${pl} missing init map`);
  if (!text.includes('#EXT-X-ENDLIST')) throw new Error(`${dir}/${pl} missing ENDLIST`);
}
if (segmentCount === 0) throw new Error('no fMP4 segments produced');
console.log(`rendition playlists: ${playlists.length}, segments: ${segmentCount}`);
console.log('HLS ladder smoke OK');
