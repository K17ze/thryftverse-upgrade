/**
 * useBarcodeScanner — real-time barcode scanning via MLKit on-device ML.
 *
 * Wraps `useBarcodeScanning` from react-native-vision-camera-mlkit into a
 * hook that returns a frame processor callback (for `useFrameOutput`) and
 * the latest detected barcodes as React state.
 *
 * Architecture (VisionCamera V5 + MLKit Nitro):
 *   - `useBarcodeScanning()` returns a `barcodeScanning(frame)` HybridObject
 *     method that runs entirely on-device via Google MLKit.
 *   - The frame processor is a worklet that calls `barcodeScanning(frame)`,
 *     normalizes corner points to 0..1, debounces duplicate scans, and
 *     syncs results to React state via `runOnJS`.
 *   - The Frame is always disposed after processing to avoid stalling the
 *     camera pipeline.
 *
 * Debouncing:
 *   MLKit fires on every frame. Without debouncing, the same barcode would
 *   be emitted 30-60 times per second. We compute a signature (sorted raw
 *   values joined) and only emit when it changes.
 *
 * Graceful degradation:
 *   If the BarcodeScanning feature is not compiled in or the native module
 *   is unavailable, the hook returns an empty barcodes array and a no-op
 *   frame processor that just disposes the frame.
 *
 * @example
 * ```tsx
 * const { frameProcessor, barcodes } = useBarcodeScanner({ enabled: true });
 * const frameOutput = useFrameOutput({ onFrame: frameProcessor });
 * <Camera device={device} outputs={[frameOutput]} isActive={true} />
 * ```
 */
import { useCallback, useState } from 'react';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import {
  useBarcodeScanning,
  isFeatureAvailable,
} from 'react-native-vision-camera-mlkit';
import type { BarcodeData } from 'react-native-vision-camera-mlkit';
import type { Barcode, BarcodeFormat, FrameProcessorCallback, Point } from './types';

// ── Hook options ───────────────────────────────────────────────────

export interface UseBarcodeScannerOptions {
  /** Whether scanning is active. When false, frames are disposed without processing. */
  enabled: boolean;
  /** Restrict detected barcode formats for better performance. */
  formats?: BarcodeFormat[];
}

// ── Hook result ────────────────────────────────────────────────────

export interface UseBarcodeScannerResult {
  /** Frame processor callback for `useFrameOutput({ onFrame })`. */
  frameProcessor: FrameProcessorCallback;
  /** Latest detected barcodes (debounced — only changes when results differ). */
  barcodes: Barcode[];
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Safely check if the BarcodeScanning feature is available at runtime.
 * Returns false if the native module is not loaded (e.g. web, Expo Go
 * without native code) rather than throwing.
 */
function isBarcodeScanningAvailable(): boolean {
  try {
    return isFeatureAvailable('BarcodeScanning');
  } catch {
    return false;
  }
}

/**
 * Map raw MLKit `BarcodeData` to our normalized `Barcode` type.
 * Corner points are normalized to 0..1 by dividing by frame dimensions.
 */
function mapBarcodes(raw: BarcodeData[], frameWidth: number, frameHeight: number): Barcode[] {
  return raw.map((b): Barcode => {
    const corners = b.corners ?? [];
    const cornerPoints: Point[] = corners.map((c) => ({
      x: frameWidth > 0 ? c.x / frameWidth : 0,
      y: frameHeight > 0 ? c.y / frameHeight : 0,
    }));
    return {
      format: b.formatName,
      value: b.rawValue ?? b.displayValue ?? '',
      cornerPoints,
    };
  });
}

/**
 * Compute a deduplication signature from raw barcode data.
 * Two frames with the same set of barcode values produce the same signature,
 * preventing redundant React state updates.
 */
function barcodeSignature(raw: BarcodeData[]): string {
  return raw
    .map((b) => b.rawValue ?? b.displayValue ?? '')
    .filter((v) => v.length > 0)
    .sort()
    .join('|');
}

// ── Hook ───────────────────────────────────────────────────────────

export function useBarcodeScanner(options: UseBarcodeScannerOptions): UseBarcodeScannerResult {
  const { enabled, formats } = options;

  const available = isBarcodeScanningAvailable();
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);

  // MLKit recognizer — always called (hooks rules). When the feature is
  // unavailable, the recognizer may throw on invocation; the frame processor
  // catches that and degrades gracefully.
  const { barcodeScanning } = useBarcodeScanning({
    formats,
  });

  // Worklet-accessible SharedValue for debouncing — stores the last emitted
  // signature so the worklet can skip `runOnJS` when results haven't changed.
  const lastSignature = useSharedValue<string>('');

  // Stable JS callback for updating React state from the worklet via runOnJS.
  const updateBarcodes = useCallback((next: Barcode[]) => {
    setBarcodes(next);
  }, []);

  const frameProcessor = useCallback<FrameProcessorCallback>(
    (frame) => {
      'worklet';
      if (!enabled || !available) {
        frame.dispose();
        return;
      }
      try {
        const result = barcodeScanning(frame);
        const sig = barcodeSignature(result.barcodes);
        if (sig !== lastSignature.value) {
          lastSignature.value = sig;
          const mapped = mapBarcodes(result.barcodes, frame.width, frame.height);
          runOnJS(updateBarcodes)(mapped);
        }
      } catch {
        // Graceful degradation — if the recognizer throws (e.g. native module
        // not loaded on this platform), silently skip this frame.
      }
      frame.dispose();
    },
    [enabled, available, barcodeScanning, lastSignature, updateBarcodes],
  );

  return { frameProcessor, barcodes };
}
