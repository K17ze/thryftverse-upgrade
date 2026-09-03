// Physics + geometry helpers shared by the poster viewer screen and its
// extracted gesture hook / particle components. Worklet-safe functions carry
// the `'worklet'` directive so they can be called from Reanimated UI-thread
// gesture handlers.

// ── Particle physics constants ────────────────────────────────────────────
// Used by the HeartBurst particle system (components/poster/HeartBurst.tsx).
export const GRAVITY = 980; // pts/sec²
export const LIFETIME_MS = 2500;
export const FADE_DELAY_MS = 1500;

// Rubber-band clamp: allows overscroll but with diminishing resistance.
export function rubberBand(value: number, min: number, max: number, friction = 0.24): number {
  'worklet';
  if (value < min) return min + (value - min) * friction;
  if (value > max) return max + (value - max) * friction;
  return value;
}

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|m4v|webm|quicktime)(\?|$)/i.test(url);
}

// Lighten/darken a hex color by a percentage (-100..100). Used to derive a
// gradient end-color from the text-frame background for Instagram Create-mode
// style depth. Falls back to the original color on parse failure.
export function shadeColor(hex: string, percent: number): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return hex;
  const num = parseInt(cleaned, 16);
  if (Number.isNaN(num)) return hex;
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
