/**
 * Video thumbnail generation — extracts JPEG thumbnails at 10-second
 * intervals plus a poster frame at 10% of the total duration.
 *
 * Thumbnails are written as individual JPEG files under the supplied output
 * directory. The poster frame is written separately so it can be used as the
 * video's primary poster image before playback begins.
 *
 * @packageDocumentation
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';
import { logger } from '../logger.js';

export interface Thumbnail {
  timeSeconds: number;
  path: string;
}

export interface ThumbnailSet {
  thumbnails: Thumbnail[];
  posterPath: string;
}

const THUMBNAIL_INTERVAL_SECONDS = 10;
const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_QUALITY = 2;

/**
 * Generates thumbnails at 10-second intervals and a poster frame at 10% of
 * the total duration. The output directory is created if it does not exist.
 *
 * @param inputPath - Path to the source video file.
 * @param outputDir - Directory where thumbnails and the poster are written.
 * @param durationMs - Total video duration in milliseconds.
 */
export async function generateThumbnails(
  inputPath: string,
  outputDir: string,
  durationMs: number,
): Promise<ThumbnailSet> {
  await mkdir(outputDir, { recursive: true });

  const durationSeconds = durationMs / 1000;
  const posterSeconds = Math.max(1, Math.floor(durationSeconds * 0.1));
  const intervalCount = Math.max(1, Math.floor(durationSeconds / THUMBNAIL_INTERVAL_SECONDS));

  const thumbnails: Thumbnail[] = [];

  // Extract one thumbnail per 10-second interval using the fps filter.
  // Each frame is written as thumb_NNNN.jpg where NNNN is the frame index.
  const thumbnailPattern = path.join(outputDir, 'thumb_%04d.jpg');
  const thumbnailArgs = [
    '-y',
    '-i', inputPath,
    '-vf', `fps=1/${THUMBNAIL_INTERVAL_SECONDS},scale=${THUMBNAIL_WIDTH}:-2`,
    '-q:v', String(THUMBNAIL_QUALITY),
    '-frames:v', String(intervalCount),
    thumbnailPattern,
  ];

  await runFfmpeg(thumbnailArgs, undefined, { totalDurationMs: durationMs });

  for (let i = 0; i < intervalCount; i += 1) {
    const framePath = path.join(outputDir, `thumb_${String(i + 1).padStart(4, '0')}.jpg`);
    const timeSeconds = (i + 1) * THUMBNAIL_INTERVAL_SECONDS;
    if (timeSeconds < durationSeconds) {
      thumbnails.push({ timeSeconds, path: framePath });
    }
  }

  // Poster frame at 10% of duration.
  const posterPath = path.join(outputDir, 'poster.jpg');
  const posterArgs = [
    '-y',
    '-ss', String(posterSeconds),
    '-i', inputPath,
    '-frames:v', '1',
    '-vf', `scale=${THUMBNAIL_WIDTH}:-2`,
    '-q:v', String(THUMBNAIL_QUALITY),
    posterPath,
  ];

  await runFfmpeg(posterArgs, undefined, { totalDurationMs: durationMs });

  logger.info(
    {
      durationSeconds,
      posterSeconds,
      thumbnailCount: thumbnails.length,
      posterPath,
    },
    '[thumbnailGenerator] thumbnails generated',
  );

  return { thumbnails, posterPath };
}
