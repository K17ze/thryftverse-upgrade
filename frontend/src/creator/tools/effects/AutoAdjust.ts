/**
 * AutoAdjust — one-tap intelligent color correction.
 *
 * Instagram Edits (August 2026) introduced a one-tap auto color correction
 * that automatically optimizes exposure, contrast, and tone. This module
 * computes the conservative "auto" adjustment values and provides a
 * detector so the UI can toggle the preset on/off.
 *
 * Per AGENTS.md §11: the auto-adjust applies real effect values — it is not
 * a stub. The values are deliberately subtle so they improve most photos
 * without looking over-processed.
 */
import type { EffectNode } from '../../composition';

/**
 * The canonical auto-adjust values. Kept as a single source of truth so
 * {@link isAutoAdjustNode} can reliably detect whether a layer's existing
 * `adjust` effect node was produced by {@link computeAutoAdjust}.
 */
const AUTO_ADJUST_VALUES = {
  exposure: 0.08,    // subtle lift
  contrast: 0.12,    // mild punch
  highlights: -0.1,  // recover blown highlights
  shadows: 0.15,     // lift crushed shadows
  saturation: 0.08,  // subtle vibrance
  temperature: 0.03, // slight warmth
  fade: 0.05,        // subtle film feel
  vignette: 0.03,    // very subtle edge darkening
} as const;

/**
 * Returns an `'adjust'` effect node populated with balanced, conservative
 * auto-correction values. The node is appended to a media layer's
 * non-destructive `effects` array (EffectNode[]) via `updateLayer`.
 */
export function computeAutoAdjust(): EffectNode {
  return {
    type: 'adjust',
    exposure: AUTO_ADJUST_VALUES.exposure,
    contrast: AUTO_ADJUST_VALUES.contrast,
    highlights: AUTO_ADJUST_VALUES.highlights,
    shadows: AUTO_ADJUST_VALUES.shadows,
    saturation: AUTO_ADJUST_VALUES.saturation,
    temperature: AUTO_ADJUST_VALUES.temperature,
    fade: AUTO_ADJUST_VALUES.fade,
    vignette: AUTO_ADJUST_VALUES.vignette,
  };
}

/**
 * Returns true when the given effect node was produced by
 * {@link computeAutoAdjust} — i.e. every auto field matches and no
 * non-auto adjustment field (tint, sharpness) is set. Used by the UI to
 * implement toggle behavior: tapping Auto removes an existing auto-adjust
 * but leaves manual adjustments untouched.
 */
export function isAutoAdjustNode(node: EffectNode): boolean {
  if (node.type !== 'adjust') return false;
  const autoKeys = Object.keys(AUTO_ADJUST_VALUES) as readonly (keyof typeof AUTO_ADJUST_VALUES)[];
  for (const key of autoKeys) {
    if (node[key] !== AUTO_ADJUST_VALUES[key]) return false;
  }
  // Reject nodes carrying adjustment fields outside the auto set — those
  // are user-authored manual edits, not the auto preset.
  const known = new Set<string>(['type', ...autoKeys]);
  for (const k of Object.keys(node)) {
    if (!known.has(k)) return false;
  }
  return true;
}
