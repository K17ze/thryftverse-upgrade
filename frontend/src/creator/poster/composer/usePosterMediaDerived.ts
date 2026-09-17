/**
 * usePosterMediaDerived — media-derived values for the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the background-media URI for draw-on-media, content
 * presence, video/audio detection, and the waveform audio URI.
 */
import { useMemo } from 'react';

import type { CreatorDocument, CreatorPage } from '../../core/projectStore/composition';
import { derivePosterAudioUri } from './posterDerived';

export interface UsePosterMediaDerivedInput {
  /** The composition document. */
  document: CreatorDocument;
  /** The active page being edited. */
  page: CreatorPage | undefined;
}

export function usePosterMediaDerived({
  document,
  page,
}: UsePosterMediaDerivedInput) {
  // ── Background media URI for draw-on-media ─────────────────────────
  // The first (lowest-zIndex) media layer on the current page is the
  // "background" that the drawing workspace renders underneath strokes,
  // so the user draws directly ON the photo/video (Snapchat/Instagram
  // pattern) instead of on a blank canvas.
  const backgroundMediaUri = useMemo(() => {
    const mediaLayer = page?.layers
      .filter((l) => l.type === 'media' && !l.hidden)
      .sort((a, b) => a.zIndex - b.zIndex)[0];
    return mediaLayer?.type === 'media' ? mediaLayer.payload.mediaUri : undefined;
  }, [page]);

  const hasContent = document.pages.some((p) => p.layers.length > 0);

  // ── Video detection — any page with video media ────────────────────
  // When video content exists, the editor enters "video mode": the
  // timeline appears below the canvas and the tool rail uses video
  // contexts. Photo-only documents use photo contexts.
  const hasVideoContent = useMemo(
    () =>
      document.pages.some((p) =>
        p.layers.some(
          (l) => l.type === 'media' && l.payload.mediaType === 'video',
        ),
      ),
    [document.pages],
  );

  // ── Audio detection — music layer or video with audio ──────────────
  // The waveform track renders when audio content exists: either an
  // explicit music layer or a video clip (which carries its own audio
  // track). Per AGENTS.md §11 we never fake waveform data — when no
  // real samples are available the WaveformTrack renders an honest flat
  // line and a "No audio waveform" label.
  const hasAudioContent = useMemo(
    () =>
      document.pages.some(
        (p) =>
          p.layers.some((l) => l.type === 'music') ||
          p.layers.some(
            (l) => l.type === 'media' && l.payload.mediaType === 'video',
          ),
      ),
    [document.pages],
  );

  // ── Audio URI for waveform extraction ──────────────────────────────
  // Derive a single audio URI to feed the WaveformTrack. We prefer an
  // explicit music layer's previewUrl (the dedicated audio asset) and fall
  // back to the first video clip's mediaUri (video carries its own audio
  // track). When neither is present, audioUri stays undefined and the
  // WaveformTrack renders its honest flat-line empty state (AGENTS.md §11).
  const audioUri = useMemo(() => derivePosterAudioUri(document), [document]);

  return {
    backgroundMediaUri,
    hasContent,
    hasVideoContent,
    hasAudioContent,
    audioUri,
  };
}

export type PosterMediaDerived = ReturnType<typeof usePosterMediaDerived>;
