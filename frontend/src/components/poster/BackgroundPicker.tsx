/**
 * BackgroundPicker — re-export from the split background/ subdirectory.
 *
 * The original 864-line monolith has been split into:
 *   - background/BackgroundPicker.tsx  — main component (uses shared colorUtils + ColorSlider)
 *   - background/GradientPresets.tsx   — 9 flagship gradient presets + preview cards
 *   - shared/colorUtils.ts             — hslToHex, hexToHsl, isLightColor (shared)
 *   - shared/ColorSlider.tsx           — HueSlider, SaturationLightnessSlider (shared)
 *   - shared/GradientRing.tsx          — active-indicator ring (shared)
 *
 * This file preserves the original import path so existing callers keep working.
 */
export { default } from './background/BackgroundPicker';
export type { BackgroundPickerProps } from './background/BackgroundPicker';
