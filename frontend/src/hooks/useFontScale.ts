import { useWindowDimensions, PixelRatio, Platform } from 'react-native';

/**
 * Maximum font scale multiplier applied to design-token font sizes.
 *
 * The OS allows users to set very large font scales (up to ~2x on Android,
 * up to ~1.5x+ on iOS Dynamic Type). Letting these propagate unbounded breaks
 * carefully composed layouts (sticky docks, order-book rows, card chrome).
 *
 * We cap the *token-level* multiplier at 1.5x so that:
 *  - Users who bump their system font size still get meaningfully larger text.
 *  - Layout-sensitive surfaces do not overflow or clip.
 *
 * Per-screen `<Text>` components should *also* set `maxFontSizeMultiplier` to
 * bound the RN-level Dynamic Type scaling (see the accessibility audit). The
 * token-level scale here is an additional, opt-in layer for text that reads
 * its size from design tokens.
 */
export const MAX_FONT_SCALE = 1.5;

/**
 * Reads the system font scale and returns a bounded multiplier that can be
 * applied to design-token font sizes.
 *
 * On Android, `useWindowDimensions().fontScale` reflects the user's system
 * font size preference and updates reactively when it changes. On iOS,
 * `fontScale` is always 1 in `useWindowDimensions`, so we fall back to
 * `PixelRatio.getFontScale()` (which tracks Dynamic Type on iOS).
 *
 * The returned multiplier is clamped to `[1, MAX_FONT_SCALE]` so layouts do
 * not break when users set very large font sizes. Consumers can apply it via
 * `scaleFont(size)` from the theme context or directly:
 *
 * ```ts
 * const fontScale = useFontScale();
 * const fontSize = Type.body.size * fontScale;
 * ```
 *
 * Per AGENTS.md §13 (Accessibility) and audit 12: "all flagship screens work
 * at 200% text". The combination of this token-level scale (capped at 1.5x)
 * and per-Text `maxFontSizeMultiplier` (capped at 2x) covers the full 200%
 * range without destroying layout.
 */
export function useFontScale(): number {
  // useWindowDimensions is reactive on Android (fontScale changes) and on
  // both platforms for window size changes. On iOS fontScale is always 1
  // here, so we combine with PixelRatio.getFontScale() below.
  const { fontScale: windowFontScale } = useWindowDimensions();

  // PixelRatio.getFontScale() is the canonical cross-platform source. On iOS
  // it reflects the Dynamic Type setting; on Android it mirrors the window
  // fontScale. We prefer the window value on Android for reactivity and fall
  // back to PixelRatio elsewhere.
  const systemScale =
    Platform.OS === 'android' ? windowFontScale : PixelRatio.getFontScale();

  // Guard against non-finite / non-positive values from emulators or web.
  const safe = Number.isFinite(systemScale) && systemScale > 0 ? systemScale : 1;

  if (safe > MAX_FONT_SCALE) {
    return MAX_FONT_SCALE;
  }
  if (safe < 1) {
    // We never shrink text below the design size — users who want smaller text
    // can use the in-app text size preference. This keeps the design baseline
    // stable.
    return 1;
  }
  return safe;
}

/**
 * Default `maxFontSizeMultiplier` for general body/content text.
 *
 * React Native's recommended value for most text is 2 — it allows Dynamic Type
 * to scale text up to 2x without overflowing containers that use auto layout.
 * Layout-sensitive fixed chrome (labels, eyebrows, tab indicators) should use
 * `MAX_FONT_SCALE_FIXED` (1) instead so they do not scale at all.
 */
export const MAX_FONT_SCALE_MULTIPLIER = 2;

/**
 * `maxFontSizeMultiplier` for text that must NOT scale (fixed-size labels in
 * cards, tab indicators, eyebrows, decorative chrome). Prevents any Dynamic
 * Type scaling so the visual composition stays intact.
 */
export const MAX_FONT_SCALE_FIXED = 1;
