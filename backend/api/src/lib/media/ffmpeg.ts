/**
 * ffmpeg spawn wrapper with progress parsing and error classification.
 *
 * Progress is reported as a 0–1 fraction by parsing the `out_time_ms` (or
 * legacy `time=`) field from ffmpeg's stderr progress lines. The caller
 * supplies the total duration so the fraction can be computed.
 *
 * Errors are classified into three categories so the pipeline can decide
 * whether to retry, dead-letter, or surface an operational alert:
 *   - `transient`    — I/O timeout, signal, or resource exhaustion (retryable)
 *   - `deterministic`— invalid codec, unsupported input, bad args (do not retry)
 *   - `operational`  — binary missing or permission failure (alert, do not retry)
 *
 * @packageDocumentation
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../logger.js';

export type FfmpegErrorCategory = 'transient' | 'deterministic' | 'operational';

export class FfmpegError extends Error {
  readonly category: FfmpegErrorCategory;
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(category: FfmpegErrorCategory, exitCode: number | null, stderr: string, message?: string) {
    const detail = message ?? `ffmpeg exited with code ${exitCode ?? 'null'}`;
    super(detail);
    this.name = 'FfmpegError';
    this.category = category;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

const DETERMINISTIC_PATTERNS = [
  /unknown encoder/i,
  /unknown decoder/i,
  /could not find tag for codec/i,
  /codec not currently supported in container/i,
  /invalid data found when processing input/i,
  /no such filter/i,
  /error while opening encoder/i,
  /unsupported codec/i,
  /not yet implemented in FFmpeg/i,
];

const TRANSIENT_PATTERNS = [
  /connection timed out/i,
  /end of file/i,
  /interrupted by signal/i,
  /resource temporarily unavailable/i,
  /cannot allocate memory/i,
  /no space left on device/i,
  /disk full/i,
];

const OPERATIONAL_PATTERNS = [
  /no such file or directory/i,
  /permission denied/i,
  /operation not permitted/i,
  /is not recognized as an internal or external command/i,
  /command not found/i,
];

function classifyError(exitCode: number | null, stderr: string): FfmpegErrorCategory {
  if (OPERATIONAL_PATTERNS.some((pattern) => pattern.test(stderr))) {
    return 'operational';
  }
  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(stderr))) {
    return 'transient';
  }
  if (DETERMINISTIC_PATTERNS.some((pattern) => pattern.test(stderr))) {
    return 'deterministic';
  }
  // SIGKILL / SIGTERM typically indicate resource pressure or shutdown.
  if (exitCode === null || exitCode < 0) {
    return 'transient';
  }
  return 'deterministic';
}

function parseProgressFraction(stderr: string, totalDurationMs: number): number | null {
  if (totalDurationMs <= 0) {
    return null;
  }

  // Prefer the structured `out_time_ms` field emitted by -progress.
  const outTimeMatch = stderr.match(/out_time_ms=(\d+)/);
  if (outTimeMatch) {
    const outTimeMs = Number(outTimeMatch[1]) / 1000;
    if (Number.isFinite(outTimeMs) && outTimeMs >= 0) {
      return Math.min(outTimeMs / totalDurationMs, 1);
    }
  }

  // Fall back to the human-readable `time=HH:MM:SS.mmm` pattern.
  const timeMatch = stderr.match(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const seconds = Number(timeMatch[3]);
    const elapsedMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
      return Math.min(elapsedMs / totalDurationMs, 1);
    }
  }

  return null;
}

/**
 * Runs ffmpeg with the supplied argument vector. When `totalDurationMs` is
 * provided and an `onProgress` callback is supplied, progress is reported as
 * a 0–1 fraction based on the current output time.
 *
 * Resolves when ffmpeg exits cleanly (code 0). Rejects with an
 * {@link FfmpegError} on non-zero exit or spawn failure.
 */
export function runFfmpeg(
  args: string[],
  onProgress?: (fraction: number) => void,
  options?: { totalDurationMs?: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const runId = randomUUID();
    const ffmpegPath = ffmpegStatic;

    if (!ffmpegPath) {
      reject(new FfmpegError('operational', null, '', 'ffmpeg binary is not available for this platform'));
      return;
    }

    const totalDurationMs = options?.totalDurationMs ?? 0;
    const child = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = '';
    let lastReportedFraction = -1;

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;

      if (onProgress) {
        const fraction = parseProgressFraction(stderr.split('\n').pop() ?? text, totalDurationMs);
        if (fraction !== null && fraction > lastReportedFraction) {
          lastReportedFraction = fraction;
          onProgress(fraction);
        }
      }
    });

    child.on('error', (error) => {
      logger.error({ err: error, runId, args }, '[ffmpeg] spawn error');
      reject(new FfmpegError('operational', null, error.message, `ffmpeg failed to start: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        logger.debug({ runId, args }, '[ffmpeg] completed');
        resolve();
        return;
      }

      const category = classifyError(code, stderr);
      logger.error({ code, category, stderr: stderr.slice(-2000), runId, args }, '[ffmpeg] non-zero exit');
      reject(new FfmpegError(category, code, stderr));
    });
  });
}
