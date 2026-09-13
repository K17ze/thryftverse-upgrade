import { useState, useMemo, useCallback } from 'react';
import { AspectRatio } from '../../theme/designTokens';
import type { LookApiItem } from '../../services/looksApi';
import type { LookMediaCarouselPage } from '../../components/look/LookMediaCarousel';
import { safeValidateDocument, type CreatorDocument, type CreatorPage } from '../../creator/composition';
import { pageWithRenderedMedia } from '../../creator/renderedViewDocument';

export interface UseLookMediaResult {
  /** Pager pages: primary mediaUrl is slide 0, carousel slides follow. */
  mediaPages: LookMediaCarouselPage[];
  /** Validated authored composition document, when the look has one. */
  compositionDocument: CreatorDocument | null;
  /** First page with the rendered artifact substituted when mediaUrl is a
   *  baked render — the canvas plays THAT, not the doc's raw source URI. */
  compositionPage: CreatorPage | null;
  resolvedHeroAspectRatio: number;
  heroHeight: number;
  fullscreenVisible: boolean;
  fullscreenIndex: number;
  setFullscreenIndex: (index: number) => void;
  /** Single-tap on a carousel page — opens the fullscreen viewer at index. */
  openFullscreen: (index: number) => void;
  closeFullscreen: () => void;
}

/**
 * Owns the hero-media domain: the carousel page model, the authored
 * composition document + rendered-artifact substitution, the resolved hero
 * aspect ratio/height, and the fullscreen media viewer state.
 */
export function useLookMedia(look: LookApiItem | null, screenWidth: number): UseLookMediaResult {
  const [heroAspectRatio] = useState<number>(AspectRatio.marketplace);

  // Fullscreen media viewer — opened when the user single-taps a carousel page.
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  // Build the media pager pages. The primary mediaUrl is slide 0;
  // additional carousel slides from look.mediaUrls follow. When the API
  // has no carousel slides, this degrades to a single-page carousel.
  const mediaPages: LookMediaCarouselPage[] = useMemo(() => {
    if (!look) return [];
    const primaryIsVideo =
      look.mediaType === 'video' ||
      (() => {
        const url = look.mediaUrl.toLowerCase();
        return (
          url.endsWith('.mp4') ||
          url.endsWith('.mov') ||
          url.endsWith('.webm') ||
          url.includes('/video/')
        );
      })();
    const pages: LookMediaCarouselPage[] = [
      { id: 'media-0', uri: look.mediaUrl, isVideo: primaryIsVideo },
    ];
    if (look.mediaUrls && look.mediaUrls.length > 0) {
      look.mediaUrls.forEach((slide, i) => {
        pages.push({
          id: `media-${i + 1}`,
          uri: slide.url,
          isVideo: slide.mediaType === 'video' });
      });
    }
    return pages;
  }, [look]);

  const compositionDocument = useMemo<CreatorDocument | null>(() => {
    if (!look?.compositionDocument) return null;
    const parsed = safeValidateDocument(look.compositionDocument);
    const candidate = parsed.data;
    if (!parsed.success || !candidate || candidate.type !== 'look' || !candidate.pages[0]) {
      return null;
    }
    return candidate;
  }, [look?.compositionDocument]);

  // When `look.mediaUrl` is a rendered artifact (backend burned trim/
  // speed/overlays into it at publish), the canvas must play THAT — not
  // the doc's raw source URI. `pageWithRenderedMedia` substitutes the
  // artifact and keeps only live/interactive layers on top.
  const compositionPage = useMemo(() => {
    const page = compositionDocument?.pages[0] ?? null;
    if (!page || !look?.mediaUrl) return page;
    const mediaLayer = page.layers.find((l) => l.type === 'media' && !l.hidden);
    if (!mediaLayer || mediaLayer.type !== 'media') return page;
    if (mediaLayer.payload.mediaUri === look.mediaUrl) return page;
    return pageWithRenderedMedia(
      page,
      look.mediaUrl,
      look.mediaType === 'video' ? 'video' : 'image',
    );
  }, [compositionDocument, look?.mediaUrl, look?.mediaType]);

  const resolvedHeroAspectRatio = compositionDocument?.canvas.aspectRatio || heroAspectRatio;
  const heroHeight = screenWidth / resolvedHeroAspectRatio;

  const openFullscreen = useCallback((index: number) => {
    setFullscreenIndex(index);
    setFullscreenVisible(true);
  }, []);

  const closeFullscreen = useCallback(() => setFullscreenVisible(false), []);

  return {
    mediaPages,
    compositionDocument,
    compositionPage,
    resolvedHeroAspectRatio,
    heroHeight,
    fullscreenVisible,
    fullscreenIndex,
    setFullscreenIndex,
    openFullscreen,
    closeFullscreen,
  };
}
