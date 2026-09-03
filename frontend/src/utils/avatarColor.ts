/**
 * avatarColor — deterministic color derivation for avatar placeholders.
 *
 * Mirrors the Telegram/WhatsApp pattern: a stable, recognizable color
 * derived from the entity id/name, so every group/user has a distinct
 * visual token even before a photo is uploaded. This is the recognition-
 * over-recall principle — the eye locks onto color+initial faster than
 * reading the name.
 *
 * The palette is theme-neutral (works in light and dark mode) and
 * accessibility-conscious: every fill has ≥3:1 contrast against white
 * initials text.
 */
import { AVATAR_PALETTE } from '../theme/designTokens';

/**
 * FNV-1a hash — fast, deterministic, no dependencies.
 * Produces a stable uint32 from a string.
 */
function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Returns a deterministic color from the palette for the given seed
 * (typically a group id or user id). The same id always maps to the
 * same color across sessions and devices.
 */
export function colorForId(seed: string): string {
  const idx = hashString(seed) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

/**
 * Extracts 1–2 character initials from a display name.
 * Falls back to '?' when no usable characters exist.
 */
export function initialsFromName(name: string | null | undefined): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const initials = words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return initials || '?';
}
