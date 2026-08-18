/**
 * ColorAccessibility — color picker accessibility label generators and
 * announcement helpers for the ThryftVerse creator color system.
 *
 * Provides descriptive, screen-reader-friendly labels for:
 *   - Color values (name, hex, hue, saturation, lightness, opacity)
 *   - Gradient stops (index, color name, position)
 *   - Eyedropper tool (usage instructions)
 *
 * Also provides `announceColorChange` — a throttled announcement that
 * uses `AccessibilityInfo.announceForAccessibility` to speak color
 * changes to VoiceOver / TalkBack users without flooding the screen
 * reader during continuous slider dragging.
 *
 * Per AGENTS.md §18: accessibility is a first-class requirement.
 * Pattern follows CanvasAccessibilityLabels.ts.
 */

import { AccessibilityInfo } from 'react-native';
import type { CreatorColor, GradientStop } from '../../color/ColorTypes';
import { rgbToHsl, toHexString } from '../../color/ColorMath';

// ── Throttle state (module-level) ─────────────────────────────────────

/**
 * Minimum interval (ms) between color-change announcements. Prevents
 * the screen reader from being flooded during continuous slider drags.
 */
const ANNOUNCE_THROTTLE_MS = 500;

/** Timestamp of the last color-change announcement. */
let lastColorAnnounceMs = 0;

// ── Color name from hue ───────────────────────────────────────────────

/**
 * Approximate color name from HSL values.
 * Used for the human-readable prefix in color labels.
 */
function hueToName(hue: number, saturation: number, lightness: number): string {
  if (saturation < 0.1) {
    if (lightness < 0.15) return 'Black';
    if (lightness > 0.85) return 'White';
    return 'Gray';
  }

  const h = ((hue % 360) + 360) % 360;
  if (h < 15 || h >= 345) return 'Red';
  if (h < 45) return 'Orange';
  if (h < 75) return 'Yellow';
  if (h < 105) return 'Yellow-green';
  if (h < 165) return 'Green';
  if (h < 195) return 'Cyan';
  if (h < 255) return 'Blue';
  if (h < 285) return 'Purple';
  return 'Magenta';
}

// ── Color label ───────────────────────────────────────────────────────

/**
 * Generate a descriptive accessibility label for a color value.
 *
 * Includes the color name, hex code, hue, saturation, and lightness —
 * the information a screen-reader user needs to understand and compare
 * colors.
 *
 * Format: "{Name}, hex {RRGGBB}, hue {H} degrees, {saturation}, {lightness}"
 *
 * Example: "Red, hex FF0000, hue 0 degrees, full saturation, 50 percent lightness"
 *
 * @param color The color to label (r, g, b, a in 0..1 sRGB).
 */
export function getColorAccessibilityLabel(
  color: { r: number; g: number; b: number; a: number },
): string {
  const creatorColor: CreatorColor = {
    space: 'srgb',
    r: color.r,
    g: color.g,
    b: color.b,
    a: color.a,
  };

  const hex = toHexString(creatorColor).toUpperCase().replace('#', '');
  const hsl = rgbToHsl(creatorColor);
  const hueDeg = Math.round(hsl.h);
  const satPct = Math.round(hsl.s * 100);
  const lightPct = Math.round(hsl.l * 100);

  const colorName = hueToName(hsl.h, hsl.s, hsl.l);

  const satDesc = satPct === 0
    ? 'no saturation'
    : satPct === 100
      ? 'full saturation'
      : `${satPct} percent saturation`;

  const lightDesc = lightPct === 0
    ? 'black'
    : lightPct === 100
      ? 'white'
      : `${lightPct} percent lightness`;

  // Alpha descriptor (only mention if not fully opaque)
  const alphaPart = color.a < 1
    ? `, ${Math.round(color.a * 100)} percent opacity`
    : '';

  return `${colorName}, hex ${hex}, hue ${hueDeg} degrees, ${satDesc}, ${lightDesc}${alphaPart}`;
}

// ── Gradient stop label ───────────────────────────────────────────────

/**
 * Generate a descriptive accessibility label for a gradient stop.
 *
 * Format: "Gradient stop {index} of {total}, {colorName} at {position} percent position"
 *
 * Example: "Gradient stop 2 of 4, red at 50 percent position"
 *
 * @param stop   The gradient stop to label.
 * @param index  Zero-based index of the stop in the gradient.
 * @param total  Total number of stops in the gradient.
 */
export function getGradientStopAccessibilityLabel(
  stop: GradientStop,
  index: number,
  total: number,
): string {
  const position = index + 1;
  const hsl = rgbToHsl(stop.color);
  const colorName = hueToName(hsl.h, hsl.s, hsl.l).toLowerCase();
  const positionPct = Math.round(stop.position * 100);
  return `Gradient stop ${position} of ${total}, ${colorName} at ${positionPct} percent position`;
}

// ── Eyedropper label ──────────────────────────────────────────────────

/**
 * Generate accessibility instructions for the eyedropper tool.
 *
 * Returns a label that explains what the eyedropper does and how to use it,
 * so screen-reader users understand the interaction even if they cannot
 * visually target a pixel.
 *
 * @returns Instructions string for the eyedropper accessibility label.
 */
export function getEyedropperAccessibilityLabel(): string {
  return 'Eyedropper. Tap to pick a color from the canvas. ' +
    'The color under the crosshair will be selected and applied to the current fill.';
}

// ── Throttled announcement ────────────────────────────────────────────

/**
 * Announce a color change to screen-reader users via
 * `AccessibilityInfo.announceForAccessibility`.
 *
 * The announcement is throttled to at most one per `ANNOUNCE_THROTTLE_MS`
 * (500ms) so that continuous slider dragging does not flood the screen
 * reader with redundant messages. The throttle is module-level, so it
 * persists across renders.
 *
 * @param color The new color value to announce.
 */
export function announceColorChange(color: { r: number; g: number; b: number; a: number }): void {
  const now = Date.now();
  if (now - lastColorAnnounceMs < ANNOUNCE_THROTTLE_MS) return;
  lastColorAnnounceMs = now;

  const label = getColorAccessibilityLabel(color);
  try {
    AccessibilityInfo.announceForAccessibility(label);
  } catch {
    // AccessibilityInfo may be unavailable on some platforms — no-op.
  }
}

/**
 * Reset the color announcement throttle. Useful when a new color editing
 * session begins (e.g. a different layer is selected) so the first
 * change is announced immediately.
 */
export function resetColorAnnounceThrottle(): void {
  lastColorAnnounceMs = 0;
}
