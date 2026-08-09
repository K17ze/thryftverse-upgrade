/**
 * Shared color utility functions for the poster/creator surfaces.
 *
 * This module consolidates the HSL ↔ hex, RGB ↔ hex, luminance, contrast,
 * and interpolation helpers that were previously copy-pasted across:
 *   - FilterStrip.tsx
 *   - DrawingCanvas.tsx
 *   - BackgroundPicker.tsx
 *   - CreatorAssetPicker.tsx
 *   - TextOverlayCanvas.tsx
 *   - AIAgentIntegrationScreen.tsx (withAlpha)
 *   - utils/accessibility.ts (hexToRgb, getLuminance, getContrastRatio)
 *
 * All functions are pure (no side effects), fully typed, and exported so
 * Wave 2 can swap local definitions for a single shared import.
 *
 * @module colorUtils
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** RGB triplet with channels in the 0–255 range. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** HSL triplet with h in 0–360, s in 0–100, l in 0–100. */
export interface HSL {
  h: number;
  s: number;
  l: number;
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Normalise a hex string by removing the leading `#` and expanding 3-digit
 * shorthand (e.g. `#abc` → `aabbcc`). Returns the raw 6-character lowercase
 * hex body, or an empty string when the input is not a valid hex colour.
 */
function normalizeHexBody(hex: string): string {
  if (!hex) return '';
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c
      .split('')
      .map((x) => x + x)
      .join('');
  }
  // Only accept 6-character hex bodies from here.
  if (c.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(c)) return '';
  return c.toLowerCase();
}

/**
 * Clamp a number to the inclusive `[min, max]` range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── RGB ↔ Hex ───────────────────────────────────────────────────────────────

/**
 * Convert an RGB triplet (0–255 per channel) to a `#rrggbb` hex string.
 *
 * Channel values outside 0–255 are clamped.
 *
 * @param r - Red channel (0–255)
 * @param g - Green channel (0–255)
 * @param b - Blue channel (0–255)
 * @returns Lowercase `#rrggbb` hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert a `#rrggbb` or `#rgb` hex string to an RGB triplet.
 *
 * Returns `null` when the input is not a parseable hex colour, matching the
 * signature used in `utils/accessibility.ts` so callers can guard with a
 * truthiness check.
 *
 * @param hex - Hex string, with or without leading `#`. Supports 3- and 6-digit forms.
 * @returns `{ r, g, b }` with channels in 0–255, or `null` if invalid.
 */
export function hexToRgb(hex: string): RGB | null {
  const c = normalizeHexBody(hex);
  if (!c) return null;
  return {
    r: parseInt(c.substring(0, 2), 16),
    g: parseInt(c.substring(2, 4), 16),
    b: parseInt(c.substring(4, 6), 16),
  };
}

// ── HSL ↔ Hex ───────────────────────────────────────────────────────────────

/**
 * Convert HSL values to a `#rrggbb` hex string.
 *
 * This is the canonical implementation shared by `DrawingCanvas.tsx` and
 * `BackgroundPicker.tsx`. Hue is normalised via modulo so any numeric input
 * is safe; saturation and lightness are clamped to 0–100 before scaling.
 *
 * @param h - Hue (0–360, values outside are wrapped via modulo)
 * @param s - Saturation (0–100, clamped)
 * @param l - Lightness (0–100, clamped)
 * @returns Lowercase `#rrggbb` hex string.
 */
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const sNorm = clamp(s, 0, 100) / 100;
  const lNorm = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert a `#rrggbb` or `#rgb` hex string to an HSL triplet.
 *
 * Matches the implementation in `DrawingCanvas.tsx` / `BackgroundPicker.tsx`:
 * returns `{ h: 0, s: 0, l: 50 }` for invalid or non-hex input (e.g. `rgba(...)`
 * strings), and rounds each component to the nearest integer.
 *
 * @param hex - Hex string, with or without leading `#`.
 * @returns `{ h, s, l }` with h in 0–360, s and l in 0–100.
 */
export function hexToHsl(hex: string): HSL {
  if (!hex || !hex.startsWith('#')) return { h: 0, s: 0, l: 50 };
  const c = normalizeHexBody(hex);
  if (!c) return { h: 0, s: 0, l: 50 };

  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// ── Luminance & contrast ────────────────────────────────────────────────────

/**
 * Determine whether a hex colour is "light" using the perceptual luminance
 * formula `0.299·R + 0.587·G + 0.114·B` (normalised to 0–1).
 *
 * Used across the poster surfaces to choose a black or white checkmark /
 * glyph on top of a coloured swatch. Returns `false` for falsy or `rgba(...)`
 * inputs, matching the original copy-pasted implementations.
 *
 * @param hex - Hex string (e.g. `#ffcc00`). `rgba(...)` and falsy values return `false`.
 * @returns `true` when the colour's luminance exceeds 0.6.
 */
export function isLightColor(hex: string): boolean {
  if (!hex || hex.startsWith('rgba')) return false;
  const c = normalizeHexBody(hex);
  if (!c) return false;
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

/**
 * Calculate the WCAG relative luminance of a colour.
 *
 * Uses the standard sRGB transfer function and the Rec. 709 coefficients
 * (`0.2126·R + 0.7152·G + 0.0722·B`), matching `utils/accessibility.ts`.
 * Returns 0 for unparseable input.
 *
 * @param color - Hex string.
 * @returns Relative luminance in the range 0–1.
 */
export function getLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const linearize = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  );
}

/**
 * Calculate the WCAG contrast ratio between two colours.
 *
 * Returns a ratio from 1:1 (identical) to 21:1 (black vs white). WCAG 2.1
 * requires 4.5:1 for normal text and 3:1 for large text.
 *
 * @param color1 - First hex colour.
 * @param color2 - Second hex colour.
 * @returns Contrast ratio (1–21).
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Pick black or white based on which provides better contrast against the
 * given background colour. Useful for auto-selecting text/icon colour on
 * dynamic backgrounds.
 *
 * @param background - Background hex colour.
 * @returns `'#000000'` or `'#ffffff'`.
 */
export function getContrastColor(background: string): string {
  const contrastWithBlack = getContrastRatio('#000000', background);
  const contrastWithWhite = getContrastRatio('#ffffff', background);
  return contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff';
}

// ── Interpolation ───────────────────────────────────────────────────────────

/**
 * Linearly interpolate between two hex colours in RGB space.
 *
 * At `t = 0` the result equals `color1`; at `t = 1` it equals `color2`.
 * `t` is clamped to `[0, 1]`. Invalid input colours fall back to the other
 * colour (or `#000000` if both are invalid) so callers always receive a
 * valid hex string.
 *
 * @param color1 - Starting hex colour.
 * @param color2 - Ending hex colour.
 * @param t - Interpolation factor (0–1, clamped).
 * @returns Interpolated `#rrggbb` hex string.
 */
export function interpolateColor(color1: string, color2: string, t: number): string {
  const factor = clamp(t, 0, 1);
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  // Graceful fallbacks so callers always get a valid hex string.
  const a = rgb1 ?? rgb2 ?? { r: 0, g: 0, b: 0 };
  const b = rgb2 ?? rgb1 ?? { r: 0, g: 0, b: 0 };

  const r = Math.round(a.r + (b.r - a.r) * factor);
  const g = Math.round(a.g + (b.g - a.g) * factor);
  const bl = Math.round(a.b + (b.b - a.b) * factor);

  return rgbToHex(r, g, bl);
}

// ── Alpha helpers ───────────────────────────────────────────────────────────

/**
 * Append an alpha channel to a `#rrggbb` hex colour, producing an 8-digit
 * `#rrggbbaa` hex string.
 *
 * Matches the implementation in `AIAgentIntegrationScreen.tsx`. Only
 * 7-character `#rrggbb` inputs are supported; other values are returned
 * unchanged so callers don't silently corrupt non-hex colour strings.
 *
 * @param hex - `#rrggbb` hex string.
 * @param alpha - Opacity (0–1, clamped).
 * @returns `#rrggbbaa` hex string, or the original input if not `#rrggbb`.
 */
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = clamp(Math.round(alpha * 255), 0, 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

// ── HSL adjustments ─────────────────────────────────────────────────────────

/**
 * Adjust the lightness of a hex colour by a delta in HSL space.
 *
 * Positive `delta` lightens; negative `delta` darkens. The result is clamped
 * to valid lightness (0–100) and returned as a hex string.
 *
 * @param hex - Source hex colour.
 * @param delta - Lightness delta in percentage points (e.g. +10, -20).
 * @returns Adjusted `#rrggbb` hex string.
 */
export function adjustLightness(hex: string, delta: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, clamp(l + delta, 0, 100));
}

/**
 * Lighten a hex colour by a given percentage (0–100).
 *
 * @param hex - Source hex colour.
 * @param amount - Amount to lighten (0–100).
 * @returns Lightened `#rrggbb` hex string.
 */
export function lightenColor(hex: string, amount: number): string {
  return adjustLightness(hex, Math.abs(amount));
}

/**
 * Darken a hex colour by a given percentage (0–100).
 *
 * @param hex - Source hex colour.
 * @param amount - Amount to darken (0–100).
 * @returns Darkened `#rrggbb` hex string.
 */
export function darkenColor(hex: string, amount: number): string {
  return adjustLightness(hex, -Math.abs(amount));
}
