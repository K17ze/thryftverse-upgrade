/**
 * ffprobe wrapper — spawns the bundled ffprobe binary against a local file
 * path or URL and parses the JSON output into a normalised
 * {@link MediaProbeResult}.
 *
 * The probe result drives derivative generation: image pipelines use width
 * and height to cap responsive sizes; video pipelines use duration, codec and
 * frame rate to build the ABR ladder and thumbnail schedule.
 *
 * @packageDocumentation
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import ffprobeStatic from 'ffprobe-static';
import { logger } from '../logger.js';

export interface HDRMetadata {
  /** Transfer characteristic, e.g. "smpte2084" (PQ) or "arib-std-b67" (HLG). */
  transfer: string | null;
  /** Colour primaries, e.g. "bt2020". */
  primaries: string | null;
  /** Matrix coefficients, e.g. "bt2020nc". */
  matrix: string | null;
  /** Reported peak luminance in cd/m², when available. */
  maxLuminance: number | null;
}

export interface MediaProbeResult {
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  width: number | null;
  height: number | null;
  durationMs: number | null;
  codec: string | null;
  container: string | null;
  frameRate: number | null;
  bitRate: number | null;
  audioCodec: string | null;
  audioChannels: number | null;
  audioSampleRate: number | null;
  hdrMetadata: HDRMetadata | null;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  bit_rate?: string;
  channels?: number;
  sample_rate?: string;
  color_transfer?: string;
  color_primaries?: string;
  color_space?: string;
  max_luminance?: string;
}

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

function parseFrameRate(raw: string | undefined): number | null {
  if (!raw || raw === '0/0') {
    return null;
  }
  const [numerator, denominator] = raw.split('/');
  const num = Number(numerator);
  const den = Number(denominator ?? '1');
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return null;
  }
  return num / den;
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveMediaKind(streams: FfprobeStream[]): 'image' | 'video' | 'audio' | 'document' {
  const hasVideo = streams.some((stream) => stream.codec_type === 'video');
  const hasAudio = streams.some((stream) => stream.codec_type === 'audio');
  if (hasVideo) {
    const video = streams.find((stream) => stream.codec_type === 'video');
    const codec = video?.codec_name ?? '';
    // Single-frame image codecs (mjpeg, png, webp, gif stills) are probed as
    // video streams with no audio and a known image codec.
    const imageCodecs = new Set(['mjpeg', 'png', 'webp', 'gif', 'jpegls', 'jpegxl']);
    if (imageCodecs.has(codec) && !hasAudio) {
      return 'image';
    }
    return 'video';
  }
  if (hasAudio) {
    return 'audio';
  }
  return 'document';
}

function resolveHdrMetadata(stream: FfprobeStream | undefined): HDRMetadata | null {
  if (!stream) {
    return null;
  }
  const transfer = stream.color_transfer ?? null;
  const primaries = stream.color_primaries ?? null;
  const matrix = stream.color_space ?? null;
  const maxLuminance = parseNumber(stream.max_luminance);
  if (!transfer && !primaries && !matrix && maxLuminance === null) {
    return null;
  }
  return { transfer, primaries, matrix, maxLuminance };
}

/**
 * Probes a media file at the given path (or URL) with ffprobe and returns a
 * normalised {@link MediaProbeResult}. Throws on non-zero exit or malformed
 * JSON output.
 */
export function probeMedia(inputPath: string): Promise<MediaProbeResult> {
  return new Promise((resolve, reject) => {
    const probeId = randomUUID();
    const ffprobePath = ffprobeStatic.path;

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath,
    ];

    const child = spawn(ffprobePath, args, { windowsHide: true });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      logger.error({ err: error, probeId, inputPath }, '[ffprobe] spawn error');
      reject(new Error(`ffprobe failed to start: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        logger.error({ code, stderr, probeId, inputPath }, '[ffprobe] non-zero exit');
        reject(new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      let parsed: FfprobeOutput;
      try {
        parsed = JSON.parse(stdout) as FfprobeOutput;
      } catch (error) {
        reject(new Error(`ffprobe produced unparseable JSON: ${(error as Error).message}`));
        return;
      }

      const streams = parsed.streams ?? [];
      const videoStream = streams.find((stream) => stream.codec_type === 'video');
      const audioStream = streams.find((stream) => stream.codec_type === 'audio');
      const format = parsed.format ?? {};

      const mediaKind = resolveMediaKind(streams);
      const durationSeconds = parseNumber(format.duration);

      const result: MediaProbeResult = {
        mediaKind,
        width: videoStream?.width ?? null,
        height: videoStream?.height ?? null,
        durationMs: durationSeconds !== null ? Math.round(durationSeconds * 1000) : null,
        codec: videoStream?.codec_name ?? audioStream?.codec_name ?? null,
        container: format.format_name ?? null,
        frameRate: parseFrameRate(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate),
        bitRate: parseNumber(format.bit_rate ?? videoStream?.bit_rate),
        audioCodec: audioStream?.codec_name ?? null,
        audioChannels: audioStream?.channels ?? null,
        audioSampleRate: parseNumber(audioStream?.sample_rate),
        hdrMetadata: resolveHdrMetadata(videoStream),
      };

      logger.debug({ probeId, inputPath, mediaKind, result }, '[ffprobe] probe completed');
      resolve(result);
    });
  });
}
