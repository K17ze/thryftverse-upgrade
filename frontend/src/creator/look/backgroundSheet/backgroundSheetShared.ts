/**
 * backgroundSheetShared — presets, types and pure helpers for
 * BackgroundSheet.
 *
 * Extracted verbatim from BackgroundSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components under backgroundSheet/.
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { makeStableId } from '../../../utils/createStableId';
import { fromHexString } from '../../color/';
import type { GradientDefinition } from '../../color/';
import type { CreatorBackground } from '../../core/projectStore/composition';

// ── Presets ───────────────────────────────────────────────────────────
// These are user-facing canvas background values — intentionally hardcoded
// literals (not theme tokens) because they persist as canvas background
// values and must remain stable across light/dark mode.

export const SOLID_SWATCHES: { label: string; value: string }[] = [
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#000000' },
  { label: 'Dark', value: '#1a1a1a' },
  { label: 'Light', value: '#f5f5f5' },
  { label: 'Silver', value: '#e8e8e8' },
];

export const GRADIENT_PRESETS: { label: string; value: string; secondaryValue: string }[] = [
  { label: 'Dark to Light', value: '#1a1a1a', secondaryValue: '#f5f5f5' },
  { label: 'Warm', value: '#2d1b0e', secondaryValue: '#C9A46A' },
  { label: 'Cool', value: '#0a1929', secondaryValue: '#4A90D9' },
  { label: 'Neutral', value: '#e8e8e8', secondaryValue: '#f5f5f5' },
  { label: 'Sunset', value: '#9b0202', secondaryValue: '#F5D547' },
  { label: 'Ocean', value: '#06489A', secondaryValue: '#215634' },
];

export type BgType = CreatorBackground['type'];

export const TYPE_CHIPS: { id: BgType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'color', label: 'Solid', icon: 'square-outline' },
  { id: 'gradient', label: 'Gradient', icon: 'color-filter-outline' },
  { id: 'image', label: 'Image', icon: 'image-outline' },
  { id: 'blur', label: 'Blurred', icon: 'aperture-outline' },
];

// ── Helper: convert a CreatorBackground to a GradientDefinition ───────
// Used to seed the GradientEditor when the sheet opens.
export function backgroundToGradient(bg: CreatorBackground): GradientDefinition {
  if (bg.type === 'gradient' && bg.gradientStops && bg.gradientStops.length >= 2) {
    return {
      type: 'linear',
      angle: bg.gradientAngle ?? 180,
      stops: bg.gradientStops.map((s) => ({
        id: makeStableId('stop'),
        position: s.position,
        color: fromHexString(s.color) ?? { space: 'srgb', r: 0, g: 0, b: 0, a: 1 } })) };
  }
  // Default: two stops from value/secondaryValue.
  const startColor = fromHexString(bg.value) ?? { space: 'srgb' as const, r: 0.1, g: 0.1, b: 0.1, a: 1 };
  const endColor = fromHexString(bg.secondaryValue ?? '#f5f5f5') ?? { space: 'srgb' as const, r: 0.96, g: 0.96, b: 0.96, a: 1 };
  return {
    type: 'linear',
    angle: bg.gradientAngle ?? 180,
    stops: [
      { id: makeStableId('stop'), position: 0, color: startColor },
      { id: makeStableId('stop'), position: 1, color: endColor },
    ] };
}
