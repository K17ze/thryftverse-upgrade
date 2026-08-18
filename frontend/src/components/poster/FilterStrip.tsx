/**
 * FilterStrip — re-export from the split filters/ subdirectory.
 *
 * The original 953-line monolith has been split into:
 *   - filters/filterConfig.ts   — filter types, ColorMatrix data, resolution helpers
 *   - filters/FilterPreview.tsx — Skia GPU-accelerated thumbnail preview components
 *   - filters/FilterStrip.tsx   — main carousel component, intensity slider, name overlay
 *
 * This file preserves the original import path and all named exports so
 * existing callers keep working.
 */
export { default, FilterStrip } from './filters/FilterStrip';
export type { FilterStripProps } from './filters/FilterStrip';

// Re-export all types, constants, and helpers from filterConfig
export type {
  ImageFilter,
  FilterEffect,
  FilterConfig,
  ResolvedFilter,
} from './filters/filterConfig';
export {
  IDENTITY_MATRIX,
  interpolateColorMatrix,
  resolveColorMatrix,
  FILTERS,
  resolveFilter,
  filterStyleString,
  getFilterOverlay,
} from './filters/filterConfig';
