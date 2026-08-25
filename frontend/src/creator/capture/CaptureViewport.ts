// ── CaptureViewport — measured camera preview geometry + coordinate helpers ──
//
// The captureGuideViewport View in CreatorCamera previously used hardcoded
// insets + magic offsets to position grid, corner brackets, and crosshair.
// It did not own coordinate transforms, and `focusTo` received raw view
// coordinates without a measured viewport rect.
//
// This module provides:
//   - `CaptureViewport` type: the measured view rect + authored aspect ratio
//   - `useCaptureViewport` hook: measures the camera preview area via onLayout
//     and derives the available viewport after safe-area + chrome subtraction
//   - Helpers for converting tap points within the viewport
//
// VisionCamera v5 coordinate conversion:
//   The Camera/PreviewView exposes `convertViewPointToCameraPoint(...)` and
//   `convertCameraPointToViewPoint(...)` for sensor ↔ view mapping. The
//   `focusTo` call on CameraRef already accepts view coordinates and converts
//   internally, so the viewport's job is to provide the measured rect so
//   callers can reason about where a tap landed relative to the guide frame.
//
// (AGENTS.md §4 — no decorative chrome; the preview is the dominant object.
//  Brackets/crosshair are NOT shown for ordinary capture — only Visual Search
//  or explicit framing mode.)

import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

// ── Types ──────────────────────────────────────────────────────────────

/** A screen-space rectangle measured from the live view. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The measured capture viewport.
 *
 * `viewRect` is the on-screen rectangle of the guide area (after safe-area
 * and chrome subtraction). `authoredAspectRatio` is the target aspect ratio
 * for the current capture mode (e.g. 3:4 for poster, 9:16 for look) — when
 * set, the guide frame is inset within `viewRect` to match that ratio so
 * the brackets describe the actual capture crop, not the available space.
 */
export interface CaptureViewport {
  /** Measured on-screen rect of the guide area (screen coordinates). */
  viewRect: Rect;
  /** Target aspect ratio (width / height) for the capture mode, if any. */
  authoredAspectRatio?: number;
}

// ── Aspect-ratio helpers ───────────────────────────────────────────────

/**
 * Given an available rect and an optional authored aspect ratio, compute the
 * guide frame that fits within the available rect while matching the target
 * ratio. Returns the available rect unchanged when no ratio is specified
 * (e.g. visual search, which uses the full available area).
 */
export function fitAspectRatio(
  available: Rect,
  authoredAspectRatio?: number,
): Rect {
  if (!authoredAspectRatio || authoredAspectRatio <= 0) return available;
  const { x, y, width, height } = available;
  const availableRatio = width / height;
  if (availableRatio > authoredAspectRatio) {
    // Available area is wider than target — inset horizontally.
    const guideWidth = height * authoredAspectRatio;
    const offsetX = (width - guideWidth) / 2;
    return { x: x + offsetX, y, width: guideWidth, height };
  }
  // Available area is taller than target — inset vertically.
  const guideHeight = width / authoredAspectRatio;
  const offsetY = (height - guideHeight) / 2;
  return { x, y: y + offsetY, width, height: guideHeight };
}

// ── Tap-point conversion helpers ───────────────────────────────────────

/**
 * Convert a tap point from view coordinates (relative to the Camera view,
 * which fills the screen) to coordinates relative to the guide frame.
 *
 * Returns a normalized point (0..1) within the guide frame, or null if the
 * tap falls outside the guide frame. This lets downstream consumers (focus
 * reticle, visual search brackets) position themselves relative to the
 * authored crop rather than raw screen pixels.
 */
export function viewPointToViewportNormalized(
  viewPoint: { x: number; y: number },
  viewport: CaptureViewport,
): { x: number; y: number } | null {
  const { viewRect } = viewport;
  if (viewRect.width <= 0 || viewRect.height <= 0) return null;
  const relX = viewPoint.x - viewRect.x;
  const relY = viewPoint.y - viewRect.y;
  if (relX < 0 || relX > viewRect.width || relY < 0 || relY > viewRect.height) {
    return null;
  }
  return {
    x: relX / viewRect.width,
    y: relY / viewRect.height,
  };
}

/**
 * Convert a normalized viewport point (0..1 within the guide frame) back to
 * view coordinates (relative to the Camera view). Used to position overlay
 * elements (focus reticle, brackets) at a computed location within the
 * authored crop.
 */
export function viewportNormalizedToViewPoint(
  normalized: { x: number; y: number },
  viewport: CaptureViewport,
): { x: number; y: number } {
  const { viewRect } = viewport;
  return {
    x: viewRect.x + normalized.x * viewRect.width,
    y: viewRect.y + normalized.y * viewRect.height,
  };
}

// ── useCaptureViewport hook ────────────────────────────────────────────

export interface UseCaptureViewportOptions {
  /** Target aspect ratio (width / height) for the current capture mode.
   *  When provided, the guide frame is inset within the measured available
   *  area to match this ratio. Omit for modes that use the full available
   *  area (e.g. visual search). */
  authoredAspectRatio?: number;
  /** Whether this mode shows framing guides (brackets + crosshair).
   *  Per AGENTS.md §4: brackets/crosshair are ONLY for Visual Search or
   *  explicit framing mode — not for ordinary Look/Poster capture. */
  showFramingGuides: boolean;
}

export interface UseCaptureViewportResult {
  /** The measured + aspect-ratio-fitted viewport, or null before the first
   *  layout pass. */
  viewport: CaptureViewport | null;
  /** onLayout handler — attach to the container View that wraps the camera
   *  preview. The hook measures the laid-out rect and stores it. */
  onViewportLayout: (event: LayoutChangeEvent) => void;
}

/**
 * Measures the camera preview area via onLayout and derives the capture
 * viewport.
 *
 * The caller wraps the camera preview in a View that receives
 * `onViewportLayout`. Once laid out, the hook stores the rect and the
 * caller can use `viewport` to position grid, brackets, crosshair, and
 * route tap points through the viewport's coordinate space.
 *
 * The aspect-ratio fit is computed from the measured rect, so the guide
 * frame adapts to real device dimensions rather than hardcoded offsets.
 */
export function useCaptureViewport(
  options: UseCaptureViewportOptions,
): UseCaptureViewportResult {
  const { authoredAspectRatio } = options;
  const [availableRect, setAvailableRect] = useState<Rect | null>(null);

  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setAvailableRect((prev) => {
      // Avoid spurious re-renders when the rect hasn't meaningfully changed.
      if (
        prev &&
        Math.abs(prev.x - x) < 0.5 &&
        Math.abs(prev.y - y) < 0.5 &&
        Math.abs(prev.width - width) < 0.5 &&
        Math.abs(prev.height - height) < 0.5
      ) {
        return prev;
      }
      return { x, y, width, height };
    });
  }, []);

  const viewport: CaptureViewport | null = availableRect
    ? {
        viewRect: fitAspectRatio(availableRect, authoredAspectRatio),
        authoredAspectRatio,
      }
    : null;

  return { viewport, onViewportLayout };
}
