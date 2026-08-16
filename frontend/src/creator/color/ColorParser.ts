/**
 * ColorParser — HEX string parsing, validation, and sanitization.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §2: accept #RGB, #RRGGBB, #RRGGBBAA.
 * Normalize case, sanitize paste, reject invalid values, and never commit
 * malformed colors to persisted state.
 */

import type { CreatorColor } from './ColorTypes';
import { fromHexString, toHexString, normalize } from './ColorMath';

/**
 * Valid hex color lengths (excluding the leading #).
 * 3 = #RGB, 6 = #RRGGBB, 8 = #RRGGBBAA
 */
const VALID_LENGTHS = new Set([3, 6, 8]);

/**
 * Check if a string is a valid hex color (with or without leading #).
 * Accepts: #RGB, #RRGGBB, #RRGGBBAA (case-insensitive).
 */
export function isValidHex(input: string): boolean {
  const cleaned = input.trim().replace(/^#/, '');
  if (!VALID_LENGTHS.has(cleaned.length)) return false;
  return /^[0-9a-fA-F]+$/.test(cleaned);
}

/**
 * Sanitize raw paste/text input into a plausible hex string.
 * - Strips whitespace and non-hex characters.
 * - Ensures a leading #.
 * - Truncates to 9 characters (#RRGGBBAA max).
 * - Does NOT validate length — caller should check isValidHex before commit.
 */
export function sanitizeHexInput(input: string): string {
  // Remove everything except hex digits
  const hexOnly = input.replace(/[^0-9a-fA-F]/g, '');
  // Truncate to 8 hex chars max
  const truncated = hexOnly.slice(0, 8);
  return truncated.length > 0 ? `#${truncated}` : '';
}

/**
 * Normalize a hex string to canonical form: uppercase, with leading #.
 * Returns null if the input is not a valid hex color.
 */
export function normalizeHexString(input: string): string | null {
  const cleaned = input.trim().replace(/^#/, '').toUpperCase();
  if (!VALID_LENGTHS.has(cleaned.length)) return null;
  if (!/^[0-9A-F]+$/.test(cleaned)) return null;
  return `#${cleaned}`;
}

/**
 * Parse and validate a hex string into a CreatorColor.
 * Returns null for invalid input. Never throws.
 *
 * This is the single entry point for converting user-typed hex into
 * canonical color state. Invalid colors never enter persisted state.
 */
export function parseHexToColor(input: string): CreatorColor | null {
  const normalized = normalizeHexString(input);
  if (!normalized) return null;
  const color = fromHexString(normalized);
  if (!color) return null;
  return normalize(color);
}

/**
 * Convert a CreatorColor to a canonical hex string for display.
 * Uses toHexString from ColorMath (6 or 8 digits).
 */
export function colorToHex(color: CreatorColor): string {
  return toHexString(color).toUpperCase();
}

/**
 * Convert a CreatorColor to a hex string suitable for a text field.
 * Always includes the # prefix. Uppercase for display consistency.
 */
export function colorToHexDisplay(color: CreatorColor): string {
  return toHexString(color).toUpperCase();
}
