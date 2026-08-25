import { Image } from 'expo-image';
import * as Network from 'expo-network';
import { NetworkStateType } from 'expo-network';

/** Priority levels for prefetch scheduling. `critical` always prefetches. */
export type PreloadPriority = 'critical' | 'high' | 'normal' | 'low';

interface PreloadOptions {
  priority?: PreloadPriority;
  maxConcurrent?: number;
}

/**
 * Module-level toggle for network-aware prefetching. When enabled (default),
 * batch prefetches skip `high` and `normal` priority images on metered /
 * expensive connections (e.g. cellular data), preserving the user's data
 * allowance. `critical` priority images always prefetch regardless of network
 * state — they are required for first-viewport rendering.
 *
 * @see setNetworkAwarenessEnabled
 */
let networkAwarenessEnabled = true;

/**
 * Enable or disable network-aware prefetch throttling.
 *
 * When enabled (the default), {@link preloadCriticalImages} and the
 * `preload*` helpers consult the current network state and skip non-critical
 * prefetches on metered connections. When disabled, all priorities prefetch
 * unconditionally — useful for explicit user actions (e.g. "preload all
 * images") or for tests.
 *
 * @param enabled - Whether network-aware throttling is active.
 */
export function setNetworkAwarenessEnabled(enabled: boolean): void {
  networkAwarenessEnabled = enabled;
}

/**
 * Returns whether network-aware prefetch throttling is currently active.
 */
export function isNetworkAwarenessEnabled(): boolean {
  return networkAwarenessEnabled;
}

/**
 * Determines whether the device is currently on a metered / expensive
 * connection by querying `expo-network`.
 *
 * Cellular connections are treated as metered/expensive; Wi-Fi and Ethernet
 * are unmetered. If the `expo-network` API is unavailable or rejects, this
 * returns `false` (unmetered) so critical prefetches are never blocked purely
 * because the network could not be classified.
 */
async function isConnectionExpensiveAsync(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.type === NetworkStateType.CELLULAR;
  } catch {
    return false;
  }
}

/**
 * Preload critical images for instant display.
 *
 * Priority: Hero poster, first 4 product cards, user avatars.
 *
 * ## Metered connection strategy
 *
 * When network awareness is enabled (see {@link setNetworkAwarenessEnabled})
 * and the device is on a metered / expensive connection (e.g. cellular data),
 * only `critical` priority images are prefetched. `high`, `normal` and `low`
 * priority images are skipped to preserve the user's data allowance — they
 * will still load on demand when the user scrolls to them. `critical` priority
 * images always prefetch regardless of network state because they are required
 * for first-viewport rendering.
 *
 * If `expo-network` cannot classify the connection, the prefetch proceeds as
 * if the connection were unmetered (safe default — never block critical work).
 *
 * @param urls - Image URLs to prefetch. Invalid / non-http URLs are filtered out.
 * @param options - Priority and concurrency options.
 */
export async function preloadCriticalImages(
  urls: string[],
  options: PreloadOptions = {}
): Promise<void> {
  const { priority = 'high', maxConcurrent = 4 } = options;

  // Filter out invalid URLs
  const validUrls = urls.filter(url => url && url.startsWith('http'));

  if (validUrls.length === 0) return;

  // On metered / expensive connections, skip non-critical prefetches to
  // preserve the user's data allowance. Critical images always prefetch.
  if (networkAwarenessEnabled && priority !== 'critical') {
    const expensive = await isConnectionExpensiveAsync();
    if (expensive) {
      return;
    }
  }

  try {
    // Load in batches to not overwhelm
    for (let i = 0; i < validUrls.length; i += maxConcurrent) {
      const batch = validUrls.slice(i, i + maxConcurrent);
      await Promise.all(
        batch.map(url =>
          Image.prefetch(url, {
            cachePolicy: 'memory-disk',
          })
        )
      );
    }
  } catch (e) {
    console.warn('Image preloading failed:', e);
  }
}

/**
 * Preload poster images for HomeScreen.
 */
export function preloadPosters(posterImages: string[]): Promise<void> {
  return preloadCriticalImages(posterImages.slice(0, 6), { priority: 'high' });
}

/**
 * Preload product card images.
 */
export function preloadProductCards(productImages: string[]): Promise<void> {
  return preloadCriticalImages(productImages.slice(0, 4), { priority: 'normal' });
}

/**
 * Preload user avatars.
 */
export function preloadAvatars(avatarUrls: string[]): Promise<void> {
  return preloadCriticalImages(avatarUrls, { priority: 'high', maxConcurrent: 10 });
}

/**
 * Clear image cache (useful for logout/memory cleanup).
 */
export async function clearImageCache(): Promise<void> {
  try {
    await Image.clearMemoryCache();
    await Image.clearDiskCache();
  } catch (e) {
    console.warn('Failed to clear image cache:', e);
  }
}
