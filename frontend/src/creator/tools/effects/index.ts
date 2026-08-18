/**
 * Barrel exports for the creator native effect system.
 *
 * Replaces the legacy CSS-filter approach with a real GPU-based Skia render
 * graph (spec 07). The same EffectNode graph powers thumbnail, canvas,
 * viewer, and export — guaranteeing WYSIWYG.
 */
export type {
  AdjustNode,
  MatrixNode,
  LutNode,
  BlurNode,
  GrainNode,
  MaskNode,
  EffectNode,
  EffectPresetCategory,
  EffectPreset,
  EffectStack,
} from './EffectTypes';

export {
  IDENTITY_MATRIX,
  getThumbnailMatrix,
  interpolateMatrix,
} from './EffectTypes';

export {
  FILTER_PRESETS,
  ADJUST_PARAMETERS,
  ADJUST_PARAM_MAP,
  type AdjustParameterId,
} from './EffectPresets';

export { EffectPreviewThumb } from './EffectPreviewThumb';
export type { EffectPreviewThumbProps } from './EffectPreviewThumb';

export { EffectPreviewRail } from './EffectPreviewRail';
export type { EffectPreviewRailProps } from './EffectPreviewRail';

export { AdjustPanel } from './AdjustPanel';
export type { AdjustPanelProps } from './AdjustPanel';

export { computeAutoAdjust, isAutoAdjustNode, isRealAnalysis } from './AutoAdjust';

export { AutoAdjustButton } from './AutoAdjustButton';
export type { AutoAdjustButtonProps } from './AutoAdjustButton';
