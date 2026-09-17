/**
 * textEditorShared — shared types, option sets, and helpers for the text
 * editor sheet.
 *
 * Extracted from TextEditorSheet.tsx (pure extraction, zero behavior change):
 *   - AlignmentKey / AnimationKey / ColorSection union types
 *   - ALIGNMENTS / ANIMATIONS option lists and ANIMATION_TO_PAYLOAD map
 *   - clamp / hexToColor / colorToRgba helpers
 */
import type React from 'react';
import type { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CreatorGlyphName } from '../../controls/CreatorGlyph';
import {
  fromHexString,
  toRgbaString,
  WHITE,
  type CreatorColor } from '../../color';
import type { TextStyleConfig } from './textStylePresets';

// ── Types ────────────────────────────────────────────────────────────

export type AlignmentKey = 'left' | 'center' | 'right' | 'justify';
export type AnimationKey = 'none' | 'fade' | 'rise' | 'type' | 'pop' | 'slide';
export type ColorSection = 'fill' | 'stroke' | 'shadow' | 'background';

/** Measured position of a tab item, used to drive the animated underline. */
export interface TabLayout {
  x: number;
  width: number;
}

/** Signature of the underline spring animation shared by both tab bars. */
export type AnimateUnderline = (
  layouts: TabLayout[],
  leftVal: Animated.Value,
  widthVal: Animated.Value,
  index: number,
) => void;

// ── Static option sets ────────────────────────────────────────────────

export const ALIGNMENTS: Array<{ key: AlignmentKey; glyph: CreatorGlyphName }> = [
  { key: 'left', glyph: 'align-left' },
  { key: 'center', glyph: 'align-center' },
  { key: 'right', glyph: 'align-right' },
];

export const ANIMATIONS: Array<{ key: AnimationKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'none', label: 'None', icon: 'close-outline' },
  { key: 'fade', label: 'Fade', icon: 'eye-outline' },
  { key: 'rise', label: 'Rise', icon: 'arrow-up-outline' },
  { key: 'type', label: 'Type', icon: 'keypad-outline' },
  { key: 'pop', label: 'Pop', icon: 'add-circle-outline' },
  { key: 'slide', label: 'Slide', icon: 'arrow-forward-outline' },
];

export const ANIMATION_TO_PAYLOAD: Record<AnimationKey, TextStyleConfig['textAnimation']> = {
  none: 'none',
  fade: 'fade',
  rise: 'slide',
  type: 'typewriter',
  pop: 'bounce',
  slide: 'slide' };

// ── Helpers ───────────────────────────────────────────────────────────

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function hexToColor(hex: string): CreatorColor {
  return fromHexString(hex) ?? WHITE;
}

export function colorToRgba(c: CreatorColor): string {
  return toRgbaString(c);
}
