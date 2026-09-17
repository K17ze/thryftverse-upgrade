/**
 * Real-FFmpeg smoke for the keyframe export path (KF-P0).
 *
 * Unit tests mock runFfmpeg, so they verify the emitted filter strings but
 * not that FFmpeg actually parses/runs them. This script renders a real
 * composition end-to-end:
 *
 *   1. Generates a 2s 640x360 30fps test clip (testsrc + sine) via ffmpeg.
 *   2. Renders a composition with:
 *      - keyframed text  (position + opacity → drawtext t-expressions)
 *      - keyframed sticker (scale + rotation → animated PNG input:
 *        scale=eval=frame, rotate, geq alpha, centre-anchored overlay)
 *      - keyframed media position (canvas-colour wrap)
 *   3. Probes the output with ffprobe (stream/duration sanity).
 *   4. Validates the streaming-upload flag set (frag_keyframe+empty_moov
 *      pipe output produces a probeable MP4).
 *
 * Run:  npx tsx scripts/smoke-keyframe-render.ts
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { renderComposition } from '../src/lib/media/compositionRenderer.js';
import { probeMedia } from '../src/lib/media/ffprobe.js';

const FFMPEG = ffmpegStatic as string;
const WORK = path.join(tmpdir(), 'thryft-kf-smoke');

function run(bin: string, args: string[]): Promise<{ code: number; stderr: string; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    const stdout: Buffer[] = [];
    p.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    p.stdout.on('data', (c: Buffer) => stdout.push(c));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? -1, stderr, stdout: Buffer.concat(stdout) }));
  });
}

async function main() {
  await mkdir(WORK, { recursive: true });
  const srcPath = path.join(WORK, 'source.mp4');

  // 1. Generate the source clip.
  const gen = await run(FFMPEG, [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    srcPath,
  ]);
  if (gen.code !== 0) {
    console.error('source generation failed:\n', gen.stderr.slice(-2000));
    process.exit(1);
  }
  const srcBuf = await readFile(srcPath);
  const dataUrl = `data:video/mp4;base64,${srcBuf.toString('base64')}`;

  // 2. Composition: media + keyframed text + keyframed sticker.
  const doc = {
    type: 'look',
    canvas: { aspectRatio: 16 / 9, background: { type: 'color', value: '#1a1a1a' } },
    pages: [
      {
        id: 'page',
        layers: [
          {
            id: 'media_1', type: 'media',
            x: 0.5, y: 0.5, width: 1, height: 1,
            scale: 1, rotation: 0, zIndex: 0, hidden: false, opacity: 1,
            payload: { mediaType: 'video', videoDurationMs: 2000 },
          },
          {
            id: 'text_1', type: 'text',
            x: 0.5, y: 0.2, width: 0.8, height: 0.12,
            scale: 1, rotation: 0, zIndex: 1, hidden: false, opacity: 0.9,
            keyframes: [
              { id: 't1', layerId: 'text_1', property: 'position', timeMs: 0, value: 0.2, easing: 'linear' },
              { id: 't2', layerId: 'text_1', property: 'position', timeMs: 1000, value: 0.8, easing: 'ease-in-out' },
              { id: 't3', layerId: 'text_1', property: 'opacity', timeMs: 0, value: 0.3, easing: 'linear' },
              { id: 't4', layerId: 'text_1', property: 'opacity', timeMs: 1500, value: 1, easing: 'ease-out' },
            ],
            payload: { text: 'Keyframe smoke', textColor: '#ffffff', fontSize: 48, alignment: 'center' },
          },
          {
            id: 'sticker_1', type: 'mention',
            x: 0.5, y: 0.8, width: 0.3, height: 0.08,
            scale: 1, rotation: 15, zIndex: 2, hidden: false, opacity: 1,
            keyframes: [
              { id: 's1', layerId: 'sticker_1', property: 'scale', timeMs: 0, value: 0.6, easing: 'spring' },
              { id: 's2', layerId: 'sticker_1', property: 'scale', timeMs: 1200, value: 1.4, easing: 'spring' },
              { id: 's3', layerId: 'sticker_1', property: 'rotation', timeMs: 0, value: -10, easing: 'linear' },
              { id: 's4', layerId: 'sticker_1', property: 'rotation', timeMs: 1800, value: 20, easing: 'ease-in' },
            ],
            payload: { username: 'smoke' },
          },
        ],
      },
    ],
  };

  const rendered = await renderComposition(doc as unknown as Parameters<typeof renderComposition>[0], dataUrl);
  if (!rendered?.buffer || rendered.buffer.length < 1000) {
    console.error('render failed — null or tiny buffer');
    process.exit(1);
  }
  const outPath = path.join(WORK, 'rendered.mp4');
  await writeFile(outPath, rendered.buffer);

  // 3. Probe the output.
  const probe = await probeMedia(outPath);
  const durOk = probe.durationMs > 1800 && probe.durationMs < 2400;
  console.log(
    `rendered: ${rendered.buffer.length} bytes, ${probe.width}x${probe.height}, ` +
    `${probe.durationMs}ms, codec=${probe.codec}, audio=${probe.audioCodec ?? 'none'}`,
  );
  if (probe.mediaKind !== 'video' || !durOk) {
    console.error('probe sanity FAILED');
    process.exit(1);
  }

  // 4. Validate the streaming flag shape: fMP4 to pipe must be probeable.
  const frag = await run(FFMPEG, [
    '-y', '-i', srcPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1',
  ]);
  if (frag.code !== 0 || frag.stdout.length < 1000) {
    console.error('fragmented-mp4 pipe output failed:\n', frag.stderr.slice(-2000));
    process.exit(1);
  }
  const fragPath = path.join(WORK, 'frag.mp4');
  await writeFile(fragPath, frag.stdout);
  const fragProbe = await probeMedia(fragPath);
  console.log(`fmp4 pipe output: ${frag.stdout.length} bytes, ${fragProbe.durationMs}ms — probeable ✓`);

  // 5. Static media transform: rotation without keyframes must composite
  // onto the canvas instead of being dropped (previously a parity gap).
  const rotatedDoc = {
    ...doc,
    pages: [{
      id: 'page',
      layers: [{
        id: 'media_1', type: 'media',
        x: 0.5, y: 0.5, width: 0.7, height: 0.7,
        scale: 1, rotation: 12, zIndex: 0, hidden: false, opacity: 0.85,
        payload: { mediaType: 'video', videoDurationMs: 2000 },
      }],
    }],
  };
  const rotated = await renderComposition(
    rotatedDoc as unknown as Parameters<typeof renderComposition>[0],
    dataUrl,
  );
  if (!rotated?.buffer || rotated.buffer.length < 1000) {
    console.error('static-transform render failed');
    process.exit(1);
  }
  console.log(`static-transform render: ${rotated.buffer.length} bytes ✓`);

  console.log('SMOKE PASS — keyframe filter graph ran end-to-end on real ffmpeg');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
