/**
 * Captions core module — barrel export for the ThryftVerse creator
 * caption system.
 *
 * Per spec 06_TEXT_TYPOGRAPHY_EDITORIAL_SYSTEM §6:
 *  - speech-to-text (auto captions — truthful about availability)
 *  - editable transcript
 *  - timing
 *  - style
 *  - safe-zone handling
 *  - per-line/per-word timing
 *
 * Usage:
 *   import {
 *     captionService,
 *     CaptionRenderer,
 *     type CaptionTrack,
 *     type CaptionSegment,
 *   } from '../core/captions';
 */

// ── Types ────────────────────────────────────────────────────────────
export type {
  CaptionSegment,
  CaptionTrack,
  CaptionStatus,
  CaptionStyle,
} from './CaptionTypes';
export { DEFAULT_CAPTION_STYLE } from './CaptionTypes';

// ── Service ──────────────────────────────────────────────────────────
export {
  CaptionService,
  captionService,
  CaptionUnsupportedError,
  CaptionTranscriptionError,
} from './CaptionService';

// ── Renderer ─────────────────────────────────────────────────────────
export { CaptionRenderer } from './CaptionRenderer';
export type { CaptionRendererProps } from './CaptionRenderer';
