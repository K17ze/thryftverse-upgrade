/**
 * Effect types for the creator effect preview system.
 *
 * Filter/effect choices show real-media thumbnails instead of abstract names
 * (reconstruction spec). This pass uses CSS filters via the expo-image style
 * prop — Skia color matrices are reserved for a future pass.
 */

export type EffectCategory = 'filter' | 'adjust';

export interface EffectPreset {
  id: string;
  name: string;
  category: EffectCategory;
  /** 4x5 color matrix for Skia (reserved for a future pass). */
  colorMatrix?: number[];
  /** CSS filter string applied via the expo-image style prop. */
  cssFilter?: string;
  /** Adjust values (0 = default, -1 to 1 range unless noted). */
  adjustments?: {
    exposure?: number;
    contrast?: number;
    highlights?: number;
    shadows?: number;
    saturation?: number;
    temperature?: number;
    tint?: number;
    fade?: number;
    vignette?: number;
    sharpness?: number;
  };
}

export interface EffectStack {
  presetId: string;
  /** 0–1 blend intensity of the preset. */
  intensity: number;
  adjustments: Partial<EffectPreset['adjustments']>;
}
