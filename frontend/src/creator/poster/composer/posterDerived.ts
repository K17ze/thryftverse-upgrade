/**
 * posterDerived — pure derived-value helpers for the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Each helper is the verbatim body of a `useMemo` in the
 * screen; the parent keeps the `useMemo` wrapper and dependency array.
 */
import type { CreatorDocument, CreatorLayer } from '../../core/projectStore/composition';
import type { ToolContext } from '../../core/toolRegistry';
import type { PlaybackState, ProjectedClip } from '../../core/playback';

// ── Audio URI for the waveform track ─────────────────────────────────

/**
 * Derives a single audio URI to feed the WaveformTrack. We prefer an
 * explicit music layer's preview URL; otherwise the first video layer's
 * media URI doubles as the audio source (its waveform comes from the
 * video's audio track).
 */
export function derivePosterAudioUri(document: CreatorDocument): string | undefined {
  for (const p of document.pages) {
    for (const l of p.layers) {
      if (l.type === 'music' && l.payload.previewUrl) {
        return l.payload.previewUrl;
      }
    }
  }
  for (const p of document.pages) {
    for (const l of p.layers) {
      if (l.type === 'media' && l.payload.mediaType === 'video') {
        return l.payload.mediaUri;
      }
    }
  }
  return undefined;
}

// ── Clip under the playhead ──────────────────────────────────────────

export interface FindCanvasActiveClipInput {
  /** Playhead state (currentTimeMs is the read field). */
  playbackState: PlaybackState;
  /** Projected timeline (clips carry pageId + timeline geometry). */
  projectedTimeline: { clips: ProjectedClip[] };
  /** The composition document (for the active-page fallback). */
  document: CreatorDocument;
  activePageIndex: number;
}

/**
 * The clip under the playhead — passed to CreatorCanvas so the media
 * layer can resolve clip-relative time (timed overlays, adjustment
 * scopes, audio fades) and activate the freeze-frame preview. Falls
 * back to the active page's clip when the playhead sits in a gap.
 */
export function findCanvasActiveClip({
  playbackState,
  projectedTimeline,
  document,
  activePageIndex,
}: FindCanvasActiveClipInput): ProjectedClip | null {
  const t = playbackState.currentTimeMs;
  const underPlayhead = projectedTimeline.clips.find(
    (c) => t >= c.timelineStartMs && t < c.timelineStartMs + c.durationMs,
  );
  if (underPlayhead) return underPlayhead;
  const activePageId = document.pages[activePageIndex]?.id;
  return projectedTimeline.clips.find((c) => c.pageId === activePageId) ?? null;
}

// ── Active tool context resolution ───────────────────────────────────

export interface DerivePosterToolContextInput {
  multiSelectMode: boolean;
  /** Selected layer ids (only the count matters). */
  selectedLayerIds: string[];
  /** The primary selected layer, if any. */
  selectedLayer: CreatorLayer | null;
  hasVideoContent: boolean;
}

/**
 * Determines which tool context is active based on selection state and
 * whether the document contains video content.
 */
export function derivePosterToolContext({
  multiSelectMode,
  selectedLayerIds,
  selectedLayer,
  hasVideoContent,
}: DerivePosterToolContextInput): ToolContext {
  if (multiSelectMode && selectedLayerIds.length > 0) return 'poster-multi-select';
  if (!selectedLayer) {
    return hasVideoContent ? 'poster-video-default' : 'poster-photo-default';
  }
  switch (selectedLayer.type) {
    case 'media':
      return 'poster-media-selected';
    case 'text':
      return 'poster-text-selected';
    case 'product':
      return 'poster-product-selected';
    case 'decorative':
      return 'poster-sticker-selected';
    default:
      // For other layer types (mention, look, vote, etc.), use the
      // sticker-selected context as a generic "object selected" fallback.
      return 'poster-sticker-selected';
  }
}
