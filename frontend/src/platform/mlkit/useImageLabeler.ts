/**
 * useImageLabeler — real-time image labeling via MLKit on-device ML.
 *
 * NOTE: react-native-vision-camera-mlkit currently exports barcode scanning
 * and text recognition only. Image labeling is not yet available in the
 * Nitro-based plugin. This hook is a forward-compatible stub that will
 * activate when the library adds image labeling support. Until then, it
 * returns an empty labels array and a no-op frame processor.
 *
 * When the library adds `useImageLabeling`, update the import and the
 * hook body — the public API (frameProcessor + labels) will remain the same.
 *
 * @example
 * ```tsx
 * const { frameProcessor, labels } = useImageLabeler({ enabled: true, confidenceThreshold: 0.6 });
 * ```
 */
import { useCallback, useState } from 'react';
import type { ImageLabel, FrameProcessorCallback } from './types';

// ── Hook options ───────────────────────────────────────────────────

export interface UseImageLabelerOptions {
  /** Whether labeling is active. When false, frames are disposed without processing. */
  enabled: boolean;
  /** Minimum confidence score (0..1) for a label to be included. Defaults to 0.5. */
  confidenceThreshold?: number;
}

// ── Hook result ────────────────────────────────────────────────────

export interface UseImageLabelerResult {
  /** Frame processor callback for `useFrameOutput({ onFrame })`. */
  frameProcessor: (frame: { dispose: () => void }) => void;
  /** Latest detected labels (always empty until library support is added). */
  labels: ImageLabel[];
}

// ── Hook ───────────────────────────────────────────────────────────

export function useImageLabeler(
  _options: UseImageLabelerOptions,
): UseImageLabelerResult {
  const [labels] = useState<ImageLabel[]>([]);

  const frameProcessor = useCallback(
    (frame: { dispose: () => void }) => {
      'worklet';
      // No-op until react-native-vision-camera-mlkit adds image labeling.
      frame.dispose();
    },
    [],
  );

  return { frameProcessor, labels };
}
