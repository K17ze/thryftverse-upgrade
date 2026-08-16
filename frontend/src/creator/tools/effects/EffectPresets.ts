/**
 * Curated filter presets and adjustment parameter metadata for the creator
 * effect preview system.
 *
 * Filters are expressed as CSS filter strings applied via the expo-image
 * style prop. This works immediately on both platforms without Skia.
 */
import type { EffectPreset } from './EffectTypes';

export const FILTER_PRESETS: EffectPreset[] = [
  { id: 'normal', name: 'Normal', category: 'filter', cssFilter: 'none' },
  { id: 'clean', name: 'Clean', category: 'filter', cssFilter: 'contrast(1.05) saturate(1.05)' },
  { id: 'warm', name: 'Warm', category: 'filter', cssFilter: 'sepia(0.15) saturate(1.2) brightness(1.05)' },
  { id: 'cool', name: 'Cool', category: 'filter', cssFilter: 'hue-rotate(180deg) saturate(0.9) brightness(1.02)' },
  { id: 'film', name: 'Film', category: 'filter', cssFilter: 'sepia(0.2) contrast(1.1) saturate(0.9)' },
  { id: 'soft', name: 'Soft', category: 'filter', cssFilter: 'blur(0.5px) brightness(1.05) contrast(0.95)' },
  { id: 'highcontrast', name: 'High Contrast', category: 'filter', cssFilter: 'contrast(1.3) saturate(1.1)' },
  { id: 'bw', name: 'B&W', category: 'filter', cssFilter: 'grayscale(1) contrast(1.1)' },
];

export const ADJUST_PARAMETERS = [
  { id: 'exposure', name: 'Exposure', min: -1, max: 1, default: 0 },
  { id: 'contrast', name: 'Contrast', min: -1, max: 1, default: 0 },
  { id: 'highlights', name: 'Highlights', min: -1, max: 1, default: 0 },
  { id: 'shadows', name: 'Shadows', min: -1, max: 1, default: 0 },
  { id: 'saturation', name: 'Saturation', min: -1, max: 1, default: 0 },
  { id: 'temperature', name: 'Temperature', min: -1, max: 1, default: 0 },
  { id: 'tint', name: 'Tint', min: -1, max: 1, default: 0 },
  { id: 'fade', name: 'Fade', min: 0, max: 1, default: 0 },
  { id: 'vignette', name: 'Vignette', min: 0, max: 1, default: 0 },
  { id: 'sharpness', name: 'Sharpness', min: 0, max: 1, default: 0 },
] as const;

export type AdjustParameterId = (typeof ADJUST_PARAMETERS)[number]['id'];
