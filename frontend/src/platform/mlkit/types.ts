/**
 * MLKit types — on-device ML result structures for the VisionCamera frame
 * processor pipeline.
 *
 * These types are normalized versions of the raw MLKit Nitro results,
 * stripped to the fields needed by the UI layer. Corner points are
 * normalized to the 0..1 range relative to the source frame dimensions so
 * overlays can scale them to any camera view size without knowing the
 * frame's pixel dimensions.
 *
 * @see react-native-vision-camera-mlkit
 */
import type { Frame } from 'react-native-vision-camera';

// ── Geometry ───────────────────────────────────────────────────────

/** A point in 2D space, used for barcode/text corner points. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Callback signature matching VisionCamera v5 `useFrameOutput`'s `onFrame`
 * worklet. The hook consumer passes this to `useFrameOutput({ onFrame })`
 * and adds the resulting `CameraFrameOutput` to the Camera's `outputs`.
 */
export type FrameProcessorCallback = (frame: Frame) => void;

// ── Barcode ────────────────────────────────────────────────────────

/**
 * MLKit barcode format identifiers.
 * Mirrors `BarcodeFormat` from react-native-vision-camera-mlkit.
 */
export type BarcodeFormat =
  | 'UNKNOWN'
  | 'ALL_FORMATS'
  | 'CODE_128'
  | 'CODE_39'
  | 'CODE_93'
  | 'CODABAR'
  | 'DATA_MATRIX'
  | 'EAN_13'
  | 'EAN_8'
  | 'ITF'
  | 'QR_CODE'
  | 'UPC_A'
  | 'UPC_E'
  | 'PDF417'
  | 'AZTEC';

/**
 * A detected barcode with its format, decoded value, and normalized
 * corner points (0..1 range relative to the frame).
 */
export interface Barcode {
  /** Named barcode format (e.g. 'QR_CODE', 'EAN_13'). */
  format: string;
  /** Decoded barcode payload, or display value if raw is unavailable. */
  value: string;
  /** Corner points of the barcode in normalized frame coordinates (0..1). */
  cornerPoints: Point[];
}

// ── Text Recognition (OCR) ─────────────────────────────────────────

/** An element (word or symbol) within a line of recognized text. */
export interface TextElement {
  text: string;
  /** Corner points in normalized frame coordinates (0..1). */
  cornerPoints: Point[];
}

/** A line of recognized text within a text block. */
export interface TextLine {
  text: string;
  /** Corner points in normalized frame coordinates (0..1). */
  cornerPoints: Point[];
  /** Constituent elements (words/symbols). */
  elements: TextElement[];
}

/**
 * A block of recognized text from OCR.
 * A block corresponds to a paragraph or grouped region of text.
 */
export interface TextBlock {
  text: string;
  /** Corner points in normalized frame coordinates (0..1). */
  cornerPoints: Point[];
  /** Lines of text within this block. */
  lines: TextLine[];
}

// ── Image Labeling ─────────────────────────────────────────────────

/** An image label with its confidence score (0..1). */
export interface ImageLabel {
  /** Label text (e.g. "Shoe", "Electronics"). */
  text: string;
  /** Confidence score in the range 0..1. */
  confidence: number;
}

// ── Capability ─────────────────────────────────────────────────────

/** Union of all MLKit vision capabilities exposed by this module. */
export type MLKitCapability = 'barcode' | 'text' | 'label';
