/**
 * TransitionPresets — the built-in transition catalog.
 *
 * Eight presets covering the standard editorial transition vocabulary. Each
 * preset is a static, renderable animation — no placeholder entries. The
 * preview rail consumes this array directly.
 *
 * Duration band (AGENTS.md §17): 0ms for `cut`, 200–500ms for the rest.
 */

import type { TransitionPreset } from './TransitionTypes';

export const TRANSITION_PRESETS: TransitionPreset[] = [
  { id: 'cut', type: 'cut', name: 'Cut', durationMs: 0, icon: 'cut-outline' },
  { id: 'fade', type: 'fade', name: 'Fade', durationMs: 300, icon: 'color-fill-outline' },
  { id: 'dissolve', type: 'dissolve', name: 'Dissolve', durationMs: 400, icon: 'color-filter-outline' },
  { id: 'slide', type: 'slide', name: 'Slide', durationMs: 350, icon: 'arrow-forward' },
  { id: 'zoom', type: 'zoom', name: 'Zoom', durationMs: 300, icon: 'expand-outline' },
  { id: 'wipe', type: 'wipe', name: 'Wipe', durationMs: 400, icon: 'swap-horizontal' },
  { id: 'flash', type: 'flash', name: 'Flash', durationMs: 200, icon: 'flash-outline' },
  { id: 'spin', type: 'spin', name: 'Spin', durationMs: 500, icon: 'refresh-outline' },
];

/** Look up a preset by id. Returns undefined when not found. */
export function getPresetById(id: string): TransitionPreset | undefined {
  return TRANSITION_PRESETS.find((p) => p.id === id);
}
