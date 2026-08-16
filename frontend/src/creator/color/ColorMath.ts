/**
 * ColorMath — pure color math for the ThryftVerse creator color system.
 *
 * All functions are pure and deterministic. No side effects, no I/O.
 * Channel ranges: r/g/b/a are 0..1 floats in sRGB. HSV hue is 0..360,
 * s/v are 0..1. HSL hue is 0..360, s/l are 0..1.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §1, §11, §13.
 */

import type { CreatorColor, HSV, HSL } from './ColorTypes';

// ── Constants ────────────────────────────────────────────────────────

const EPSILON = 1e-6;

// ── Clamp helpers ────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ── Normalize ────────────────────────────────────────────────────────

/**
 * Clamp and round a CreatorColor to valid ranges.
 * r/g/b/a are clamped to 0..1 and rounded to 5 decimal places for
 * deterministic serialization (avoids floating-point drift).
 */
export function normalize(color: CreatorColor): CreatorColor {
  return {
    space: 'srgb',
    r: Math.round(clamp01(color.r) * 1e5) / 1e5,
    g: Math.round(clamp01(color.g) * 1e5) / 1e5,
    b: Math.round(clamp01(color.b) * 1e5) / 1e5,
    a: Math.round(clamp01(color.a) * 1e5) / 1e5,
  };
}

/**
 * Check if two colors are equal after normalization.
 */
export function colorsEqual(a: CreatorColor, b: CreatorColor): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return (
    na.r === nb.r &&
    na.g === nb.g &&
    na.b === nb.b &&
    na.a === nb.a
  );
}

// ── RGB ↔ HSV ────────────────────────────────────────────────────────

/**
 * Convert RGB (0..1) to HSV. Returns h in 0..360, s/v in 0..1.
 */
export function rgbToHsv(color: CreatorColor): HSV {
  const { r, g, b } = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta > EPSILON) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max <= EPSILON ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

/**
 * Convert HSV (h: 0..360, s/v: 0..1) to a CreatorColor (RGB 0..1, alpha 1).
 */
export function hsvToRgb(hsv: HSV, alpha = 1): CreatorColor {
  const { h, s, v } = hsv;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  const hue = ((h % 360) + 360) % 360;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return {
    space: 'srgb',
    r: r + m,
    g: g + m,
    b: b + m,
    a: alpha,
  };
}

// ── RGB ↔ HSL ────────────────────────────────────────────────────────

/**
 * Convert RGB (0..1) to HSL. Returns h in 0..360, s/l in 0..1.
 */
export function rgbToHsl(color: CreatorColor): HSL {
  const { r, g, b } = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta > EPSILON) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const l = (max + min) / 2;
  const s = delta <= EPSILON ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s, l };
}

/**
 * Convert HSL (h: 0..360, s/l: 0..1) to a CreatorColor (RGB 0..1, alpha 1).
 */
export function hslToRgb(hsl: HSL, alpha = 1): CreatorColor {
  const { h, s, l } = hsl;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  const hue = ((h % 360) + 360) % 360;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return {
    space: 'srgb',
    r: r + m,
    g: g + m,
    b: b + m,
    a: alpha,
  };
}

// ── Interpolation ────────────────────────────────────────────────────

/**
 * Linear interpolation between two colors in RGB space.
 * Alpha is also interpolated. t is clamped to 0..1.
 */
export function lerpColor(a: CreatorColor, b: CreatorColor, t: number): CreatorColor {
  const tt = clamp01(t);
  return {
    space: 'srgb',
    r: a.r + (b.r - a.r) * tt,
    g: a.g + (b.g - a.g) * tt,
    b: a.b + (b.b - a.b) * tt,
    a: a.a + (b.a - a.a) * tt,
  };
}

// ── Alpha ────────────────────────────────────────────────────────────

/**
 * Return a copy of the color with the specified alpha.
 * Alpha is clamped to 0..1.
 */
export function withAlpha(color: CreatorColor, a: number): CreatorColor {
  return {
    space: 'srgb',
    r: color.r,
    g: color.g,
    b: color.b,
    a: clamp01(a),
  };
}

// ── Hex serialization ────────────────────────────────────────────────

function toHexByte(v: number): string {
  const clamped = clamp(Math.round(v * 255), 0, 255);
  return clamped.toString(16).padStart(2, '0');
}

/**
 * Serialize a CreatorColor to a hex string.
 * - If alpha < 1: returns #RRGGBBAA (8 digits)
 * - If alpha === 1: returns #RRGGBB (6 digits)
 *
 * Deterministic: the same normalized color always produces the same string.
 */
export function toHexString(color: CreatorColor): string {
  const n = normalize(color);
  const rgb = `${toHexByte(n.r)}${toHexByte(n.g)}${toHexByte(n.b)}`;
  if (n.a >= 1) {
    return `#${rgb}`;
  }
  return `#${rgb}${toHexByte(n.a)}`;
}

/**
 * Serialize only the RGB portion to #RRGGBB (ignores alpha).
 */
export function toHexRGB(color: CreatorColor): string {
  const n = normalize(color);
  return `#${toHexByte(n.r)}${toHexByte(n.g)}${toHexByte(n.b)}`;
}

// ── Hex parsing ──────────────────────────────────────────────────────

/**
 * Parse a hex string (#RGB, #RRGGBB, or #RRGGBBAA) into a CreatorColor.
 * Returns null if the string is not a valid hex color.
 * The leading # is optional.
 */
export function fromHexString(hex: string): CreatorColor | null {
  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;

  let r: number, g: number, b: number, a = 1;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0]! + cleaned[0]!, 16) / 255;
    g = parseInt(cleaned[1]! + cleaned[1]!, 16) / 255;
    b = parseInt(cleaned[2]! + cleaned[2]!, 16) / 255;
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
  } else if (cleaned.length === 8) {
    r = parseInt(cleaned.slice(0, 2), 16) / 255;
    g = parseInt(cleaned.slice(2, 4), 16) / 255;
    b = parseInt(cleaned.slice(4, 6), 16) / 255;
    a = parseInt(cleaned.slice(6, 8), 16) / 255;
  } else {
    return null;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null;

  return normalize({ space: 'srgb', r, g, b, a });
}

// ── Accessibility / contrast ─────────────────────────────────────────

/**
 * Relative luminance of a color per WCAG 2.2.
 * Returns a value in 0..1 where 0 is black and 1 is white.
 * Uses the sRGB transfer function.
 */
export function relativeLuminance(color: CreatorColor): number {
  const { r, g, b } = color;
  const channel = (c: number) => {
    if (c <= 0.03928) return c / 12.92;
    return Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Contrast ratio between two colors per WCAG 2.2.
 * Returns a value in 1..21 where 1 = no contrast, 21 = max contrast.
 * Alpha is ignored (only RGB luminance is compared).
 */
export function contrastRatio(fg: CreatorColor, bg: CreatorColor): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if the contrast ratio between fg and bg meets WCAG AA.
 * AA requires 4.5:1 for normal text, 3:1 for large text.
 */
export function meetsWCAGAA(fg: CreatorColor, bg: CreatorColor, largeText = false): boolean {
  const ratio = contrastRatio(fg, bg);
  return ratio >= (largeText ? 3 : 4.5);
}

/**
 * Check if the contrast ratio meets WCAG AAA.
 * AAA requires 7:1 for normal text, 4.5:1 for large text.
 */
export function meetsWCAGAAA(fg: CreatorColor, bg: CreatorColor, largeText = false): boolean {
  const ratio = contrastRatio(fg, bg);
  return ratio >= (largeText ? 4.5 : 7);
}

// ── Utility constructors ─────────────────────────────────────────────

/**
 * Create an opaque CreatorColor from 0..255 RGB integers.
 */
export function rgb255(r: number, g: number, b: number, a = 255): CreatorColor {
  return normalize({
    space: 'srgb',
    r: clamp(r, 0, 255) / 255,
    g: clamp(g, 0, 255) / 255,
    b: clamp(b, 0, 255) / 255,
    a: clamp(a, 0, 255) / 255,
  });
}

/**
 * Create a CreatorColor from 0..1 float channels.
 */
export function rgba(r: number, g: number, b: number, a = 1): CreatorColor {
  return normalize({ space: 'srgb', r, g, b, a });
}

/**
 * Common color constants (pre-normalized).
 */
export const TRANSPARENT: CreatorColor = { space: 'srgb', r: 0, g: 0, b: 0, a: 0 };
export const BLACK: CreatorColor = { space: 'srgb', r: 0, g: 0, b: 0, a: 1 };
export const WHITE: CreatorColor = { space: 'srgb', r: 1, g: 1, b: 1, a: 1 };

/**
 * Convert a CreatorColor to an rgba() CSS string (useful for non-Skia views).
 */
export function toRgbaString(color: CreatorColor): string {
  const n = normalize(color);
  const r = Math.round(n.r * 255);
  const g = Math.round(n.g * 255);
  const b = Math.round(n.b * 255);
  return `rgba(${r},${g},${b},${n.a})`;
}
