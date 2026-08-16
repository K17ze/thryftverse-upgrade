/**
 * Creator Control System — barrel export for all control primitives.
 *
 * Purpose-built button/icon/slider primitives for the ThryftVerse creator
 * editor. These primitives replace generic Pressable/Ionicons patterns with
 * a consistent, flagship-grade control system that follows AGENTS.md §4, §13,
 * §17, and §27.
 *
 * Usage:
 *   import {
 *     CreatorGlyph,
 *     CreatorIconButton,
 *     CreatorToolButton,
 *     CreatorPrimaryButton,
 *     CreatorDestructiveButton,
 *     CreatorSlider,
 *     CreatorSegmentControl,
 *     CreatorToggle,
 *   } from '@/creator/controls';
 */

// ── Glyph system ──
export { CreatorGlyph } from './CreatorGlyph';
export type { CreatorGlyphName, CreatorGlyphProps } from './CreatorGlyph';

// ── Button primitives ──
export { CreatorIconButton } from './CreatorIconButton';
export type { CreatorIconButtonProps } from './CreatorIconButton';

export { CreatorToolButton } from './CreatorToolButton';
export type { CreatorToolButtonProps, SelectedStyle } from './CreatorToolButton';

export { CreatorPrimaryButton } from './CreatorPrimaryButton';
export type { CreatorPrimaryButtonProps } from './CreatorPrimaryButton';

export { CreatorDestructiveButton } from './CreatorDestructiveButton';
export type { CreatorDestructiveButtonProps } from './CreatorDestructiveButton';

// ── Input controls ──
export { CreatorSlider } from './CreatorSlider';
export type { CreatorSliderProps } from './CreatorSlider';

export { CreatorSegmentControl } from './CreatorSegmentControl';
export type { CreatorSegmentControlProps, SegmentOption } from './CreatorSegmentControl';

export { CreatorToggle } from './CreatorToggle';
export type { CreatorToggleProps } from './CreatorToggle';
