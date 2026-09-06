import { Platform } from 'react-native';
import {
  createVideoPlayer,
  type VideoPlayer,
  type VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';

/**
 * Real video poster frames.
 *
 * expo-video's `generateThumbnailsAsync` decodes an actual frame from the
 * video on the native side and returns it as a `SharedRef<'image'>` — a
 * valid `source` for expo-image's `Image`. Frames are generated once per
 * (uri, time) pair and held in a module-level cache, so remounting a
 * thumbnail (drag reorder, status ticks) costs no additional native work.
 *
 * `generateThumbnailsAsync` is native-only (android/ios). On web — and for
 * any source the native decoder cannot handle — this module resolves to
 * `null` and never throws; callers keep their non-poster fallback.
 */

/** A resolved poster result: the native frame ref, or `null` when unavailable. */
export type VideoPoster = { source: VideoThumbnail | null };

/** Thumbnails render at 80pt — 320px of width covers 4x density without decoding 4K frames. */
const POSTER_MAX_WIDTH = 320;

/** Native image refs are retained by the cache — bound the retained memory. */
const CACHE_MAX_ENTRIES = 32;

const posterCache = new Map<string, VideoThumbnail>();
const failedKeys = new Set<string>();
const inFlight = new Map<string, Promise<VideoThumbnail | null>>();

function cacheKey(uri: string, atSec: number): string {
  return `${atSec}|${uri}`;
}

/**
 * Generate (or fetch from cache) a real poster frame for a video.
 * Resolves to `null` on web or for corrupted/unsupported sources — never throws.
 *
 * @param timeMs seek position in milliseconds (expo-video's time unit is seconds;
 *        the conversion happens here so callers can think in ms like the rest
 *        of the media pipeline). Defaults to the first frame.
 */
export async function getVideoPoster(uri: string, timeMs?: number): Promise<VideoThumbnail | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  const atSec = Math.max(0, (timeMs ?? 0) / 1000);
  const key = cacheKey(uri, atSec);
  const cached = posterCache.get(key);
  if (cached) return cached;
  if (failedKeys.has(key)) return null;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const generation = generatePoster(uri, atSec, key);
  inFlight.set(key, generation);
  return generation;
}

async function generatePoster(uri: string, atSec: number, key: string): Promise<VideoThumbnail | null> {
  let player: VideoPlayer | null = null;
  try {
    // createVideoPlayer returns a direct instance that is NOT auto-released
    // (unlike useVideoPlayer) — release it below once the frame is out.
    player = createVideoPlayer({ uri });
    const thumbnails = await player.generateThumbnailsAsync(atSec, { maxWidth: POSTER_MAX_WIDTH });
    const poster = thumbnails[0] ?? null;
    if (poster) {
      posterCache.set(key, poster);
      if (posterCache.size > CACHE_MAX_ENTRIES) {
        const oldest = posterCache.keys().next();
        if (!oldest.done) posterCache.delete(oldest.value);
      }
    } else {
      failedKeys.add(key);
    }
    return poster;
  } catch {
    // Web (no native implementation), corrupted file, unsupported codec.
    // Remember the failure so remounts don't re-spawn a native player.
    failedKeys.add(key);
    if (failedKeys.size > CACHE_MAX_ENTRIES) failedKeys.clear();
    return null;
  } finally {
    inFlight.delete(key);
    try {
      player?.release();
    } catch {
      // Player may already be released.
    }
  }
}

function peekPoster(uri: string | null | undefined, timeMs?: number): VideoThumbnail | null {
  if (uri == null || Platform.OS === 'web') return null;
  return posterCache.get(cacheKey(uri, Math.max(0, (timeMs ?? 0) / 1000))) ?? null;
}

/**
 * Poster frame for a video URI, resolved once and cached module-level.
 * Returns `null` while the frame is generating (and permanently on web or
 * failed sources) so callers can render their fallback in the meantime.
 * Stale responses after unmount or a URI change are ignored.
 */
export function useVideoPoster(uri: string | null | undefined, timeMs?: number): VideoThumbnail | null {
  const [poster, setPoster] = useState<VideoThumbnail | null>(() => peekPoster(uri, timeMs));

  useEffect(() => {
    const cached = peekPoster(uri, timeMs);
    setPoster(cached);
    if (uri == null || cached) {
      return undefined;
    }
    let cancelled = false;
    void getVideoPoster(uri, timeMs).then((thumb) => {
      if (!cancelled) setPoster(thumb);
    });
    return () => {
      cancelled = true;
    };
  }, [uri, timeMs]);

  return poster;
}
