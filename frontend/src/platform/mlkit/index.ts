/**
 * MLKit platform module — on-device ML capabilities for ThryftVerse.
 *
 * Barrel export for all MLKit hooks, overlay components, and types.
 *
 * Capabilities:
 *   - Barcode scanning (useBarcodeScanner) — scan product barcodes, QR codes
 *   - Text recognition / OCR (useTextRecognizer) — read price tags, labels
 *   - Image labeling (useImageLabeler) — identify product categories
 *
 * All capabilities run entirely on-device via Google MLKit through the
 * VisionCamera v5 frame processor pipeline at 60 FPS. No cloud round-trip,
 * no privacy concerns, works in airplane mode.
 *
 * @see react-native-vision-camera-mlkit
 */

// ── Types ──────────────────────────────────────────────────────────
export type {
  Point,
  FrameProcessorCallback,
  BarcodeFormat,
  Barcode,
  TextElement,
  TextLine,
  TextBlock,
  ImageLabel,
  MLKitCapability,
} from './types';

// ── Hooks ──────────────────────────────────────────────────────────
export { useBarcodeScanner } from './useBarcodeScanner';
export type { UseBarcodeScannerOptions, UseBarcodeScannerResult } from './useBarcodeScanner';

export { useTextRecognizer } from './useTextRecognizer';
export type { UseTextRecognizerOptions, UseTextRecognizerResult } from './useTextRecognizer';

export { useImageLabeler } from './useImageLabeler';
export type { UseImageLabelerOptions, UseImageLabelerResult } from './useImageLabeler';
