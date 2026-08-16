/**
 * CaptionTypes — contracts for the ThryftVerse creator caption system.
 *
 * Per spec 06_TEXT_TYPOGRAPHY_EDITORIAL_SYSTEM §6, a 2026 zero-gap video
 * creator needs:
 *  - speech-to-text (auto captions)
 *  - editable transcript
 *  - timing
 *  - style
 *  - safe-zone handling
 *  - per-line/per-word timing if the pipeline supports it robustly
 *
 * Per AGENTS.md §11 (truthful UI): auto captions require a speech
 * recognition native module. As of this build, no STT module
 * (expo-speech-recognition, expo-sherpa-onnx, expo-ai-kit, etc.) is
 * present in package.json, so `CaptionService.isAvailable()` returns
 * false and the UI presents an honest "unsupported" state rather than
 * fabricating transcription results. Manual captions are fully
 * functional — the user can type text, set timing, edit, and delete.
 */

/**
 * A single caption segment with text and timing.
 *
 * When `words` is populated, the renderer can do word-by-word highlight
 * (TikTok/Reels style). When absent, the whole segment is shown at once.
 */
export interface CaptionSegment {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  /** Optional confidence score (0..1) from auto-transcription. */
  confidence?: number;
  /**
   * Optional per-word timing for word-by-word highlight. Each entry has
   * the word text and its start time relative to the segment start (ms).
   * Only populated when the transcription pipeline provides word-level
   * timestamps. Manual captions leave this absent.
   */
  words?: Array<{
    text: string;
    /** Start time relative to the segment start, in ms. */
    startMs: number;
    /** End time relative to the segment start, in ms. */
    endMs: number;
  }>;
}

/**
 * A full caption track — an ordered list of segments with a language
 * and source type.
 */
export interface CaptionTrack {
  id: string;
  segments: CaptionSegment[];
  language: string;
  source: 'auto' | 'manual';
}

/**
 * The status of the caption pipeline.
 *  - `idle`          — no transcription requested
 *  - `transcribing`  — transcription in progress
 *  - `ready`         — a caption track is available
 *  - `error`         — transcription failed
 *  - `unsupported`   — no STT module available on this device
 */
export type CaptionStatus = 'idle' | 'transcribing' | 'ready' | 'error' | 'unsupported';

/**
 * The visual style applied to rendered captions. Mirrors the text layer
 * payload fields (spec 06 §1) so captions reuse the same style system
 * as authored text layers.
 */
export interface CaptionStyle {
  /** Curated text style preset id (matches textStylePresets). */
  textStyle: string;
  /** Text color as a hex string (#RRGGBB). */
  textColor: string;
  /** Optional background color behind the caption text. */
  backgroundColor?: string;
  /** Font size in points. */
  fontSize: number;
  /** Text alignment. */
  alignment: 'left' | 'center' | 'right';
  /** Opacity (0..1). */
  opacity: number;
  /** Highlight color for the active word in word-by-word mode. */
  highlightColor: string;
}

/**
 * Default caption style — white text, clean font, centered, with the
 * brand antique-gold highlight for the active word.
 */
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  textStyle: 'clean',
  textColor: '#ffffff',
  fontSize: 18,
  alignment: 'center',
  opacity: 1,
  highlightColor: '#C9A46A',
};
