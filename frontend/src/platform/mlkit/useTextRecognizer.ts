/**
 * useTextRecognizer — real-time OCR via MLKit on-device ML.
 *
 * Wraps `useTextRecognition` from react-native-vision-camera-mlkit into a
 * hook that returns a frame processor callback and the latest recognized
 * text blocks as React state.
 *
 * Architecture (VisionCamera V5 + MLKit Nitro):
 *   - `useTextRecognition()` returns a `textRecognition(frame)` method
 *     that runs entirely on-device via Google MLKit.
 *   - The frame processor is a worklet that calls `textRecognition(frame)`,
 *     normalizes corner points to 0..1, debounces duplicate results, and
 *     syncs results to React state via `runOnJS`.
 *
 * Debouncing:
 *   MLKit fires on every frame. Without debouncing, the same text would
 *   be emitted 30-60 times per second. We compute a signature (sorted text
 *   block values joined) and only emit when it changes.
 *
 * Graceful degradation:
 *   If the TextRecognition feature is not compiled in or the native module
 *   is unavailable, the hook returns an empty array and a no-op frame
 *   processor that just disposes the frame.
 *
 * @example
 * ```tsx
 * const { frameProcessor, textBlocks } = useTextRecognizer({ enabled: true });
 * ```
 */
import { useCallback, useState } from 'react';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  useTextRecognition,
  isFeatureAvailable,
  type TextRecognitionResult,
  type Corner,
} from 'react-native-vision-camera-mlkit';
import type { TextBlock, TextLine, TextElement, Point, FrameProcessorCallback } from './types';

// ── Hook options ───────────────────────────────────────────────────

export interface UseTextRecognizerOptions {
  /** Whether recognition is active. When false, frames are disposed without processing. */
  enabled: boolean;
  /** OCR language model. Defaults to 'LATIN'. */
  language?: 'LATIN' | 'CHINESE' | 'DEVANAGARI' | 'JAPANESE' | 'KOREAN';
}

// ── Hook result ────────────────────────────────────────────────────

export interface UseTextRecognizerResult {
  /** Frame processor callback for `useFrameOutput({ onFrame })`. */
  frameProcessor: FrameProcessorCallback;
  /** Latest recognized text blocks (debounced — only changes when results differ). */
  textBlocks: TextBlock[];
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Safely check if the TextRecognition feature is available at runtime.
 * Returns false if the native module is not loaded rather than throwing.
 */
function isTextRecognitionAvailable(): boolean {
  try {
    return isFeatureAvailable('TextRecognition');
  } catch {
    return false;
  }
}

/**
 * Normalize a raw corner point array to 0..1 relative to frame dimensions.
 */
function normalizeCorners(
  corners: Corner[] | undefined,
  frameWidth: number,
  frameHeight: number,
): Point[] {
  if (!corners) return [];
  return corners.map((c) => ({
    x: frameWidth > 0 ? c.x / frameWidth : 0,
    y: frameHeight > 0 ? c.y / frameHeight : 0,
  }));
}

/**
 * Map a raw MLKit `TextRecognitionResult` to our normalized `TextBlock[]`.
 * Corner points are normalized to 0..1 by dividing by frame dimensions.
 */
function mapTextBlocks(
  result: TextRecognitionResult,
  frameWidth: number,
  frameHeight: number,
): TextBlock[] {
  return result.blocks.map((block): TextBlock => ({
    text: block.text ?? '',
    cornerPoints: normalizeCorners(block.corners, frameWidth, frameHeight),
    lines: (block.lines ?? []).map((line): TextLine => ({
      text: line.text ?? '',
      cornerPoints: normalizeCorners(line.corners, frameWidth, frameHeight),
      elements: (line.elements ?? []).map((el): TextElement => ({
        text: el.text ?? '',
        cornerPoints: normalizeCorners(el.corners, frameWidth, frameHeight),
      })),
    })),
  }));
}

/**
 * Compute a deduplication signature from recognized text.
 * Two frames with the same set of text values produce the same signature,
 * preventing redundant React state updates.
 */
function textSignature(result: TextRecognitionResult): string {
  return result.blocks
    .map((b) => b.text ?? '')
    .filter((t) => t.length > 0)
    .sort()
    .join('|');
}

// ── Hook ───────────────────────────────────────────────────────────

export function useTextRecognizer(
  options: UseTextRecognizerOptions,
): UseTextRecognizerResult {
  const { enabled, language = 'LATIN' } = options;

  const reducedMotion = useReducedMotion();
  const available = isTextRecognitionAvailable();
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);

  const { textRecognition } = useTextRecognition({ language });

  // Worklet-accessible SharedValue for debouncing.
  const lastSignature = useSharedValue<string>('');

  // Stable JS callback for updating React state from the worklet via runOnJS.
  const updateTextBlocks = useCallback((next: TextBlock[]) => {
    setTextBlocks(next);
  }, []);

  const frameProcessor = useCallback<FrameProcessorCallback>(
    (frame) => {
      'worklet';
      if (!enabled || !available) {
        frame.dispose();
        return;
      }
      try {
        const result = textRecognition(frame as never);
        const sig = textSignature(result);
        if (sig !== lastSignature.value) {
          lastSignature.value = sig;
          const mapped = mapTextBlocks(result, frame.width, frame.height);
          runOnJS(updateTextBlocks)(mapped);
        }
      } catch {
        // Graceful degradation — if the recognizer throws, skip this frame.
      }
      frame.dispose();
    },
    [enabled, available, textRecognition, lastSignature, updateTextBlocks, reducedMotion],
  );

  return { frameProcessor, textBlocks };
}
