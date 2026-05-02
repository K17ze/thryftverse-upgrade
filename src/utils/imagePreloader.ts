import { Image } from 'expo-image';

interface PreloadOptions {
  priority?: 'high' | 'normal' | 'low';
  maxConcurrent?: number;
}

/**
 * Preload critical images for instant display
 * Priority: Hero poster, first 4 product cards, user avatars
 */
export async function preloadCriticalImages(
  urls: string[],
  options: PreloadOptions = {}
): Promise<void> {
  const { priority = 'high', maxConcurrent = 4 } = options;

  // Filter out invalid URLs
  const validUrls = urls.filter(url => url && url.startsWith('http'));

  if (validUrls.length === 0) return;

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
 * Preload poster images for HomeScreen
 */
export function preloadPosters(posterImages: string[]): Promise<void> {
  return preloadCriticalImages(posterImages.slice(0, 6), { priority: 'high' });
}

/**
 * Preload product card images
 */
export function preloadProductCards(productImages: string[]): Promise<void> {
  return preloadCriticalImages(productImages.slice(0, 4), { priority: 'normal' });
}

/**
 * Preload user avatars
 */
export function preloadAvatars(avatarUrls: string[]): Promise<void> {
  return preloadCriticalImages(avatarUrls, { priority: 'high', maxConcurrent: 10 });
}

/**
 * Clear image cache (useful for logout/memory cleanup)
 */
export async function clearImageCache(): Promise<void> {
  try {
    await Image.clearMemoryCache();
    await Image.clearDiskCache();
  } catch (e) {
    console.warn('Failed to clear image cache:', e);
  }
}
