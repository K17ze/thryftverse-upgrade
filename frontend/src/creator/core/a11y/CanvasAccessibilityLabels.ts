/**
 * CanvasAccessibilityLabels — comprehensive accessibility label generators
 * for the ThryftVerse creator canvas.
 *
 * Provides descriptive, screen-reader-friendly labels for:
 *   - Layers (type, position, size, state)
 *   - Tools (name + active state)
 *   - Timeline (current time, duration, clip count)
 *   - Color picker (hex, hue, saturation, lightness)
 *   - Sliders (name + current value + range)
 *
 * Labels are designed to be useful for VoiceOver / TalkBack users:
 *   - They describe the *what* (object type), *where* (position/size),
 *     and *state* (selected, locked, hidden).
 *   - They avoid redundant information that the accessibilityRole already
 *     communicates.
 *
 * Per AGENTS.md §18: accessibility is a first-class requirement, not a
 * post-hoc addition.
 */

import type { CreatorLayer } from '../../composition';
import { getLayerCategoryLabel } from '../../../components/poster/shared/layerAccents';
import type { CreatorColor } from '../../color/ColorTypes';
import { rgbToHsl, toHexString } from '../../color/ColorMath';
import { formatTimecode } from '../../poster/timeline/TimelineTypes';

// ── Layer labels ───────────────────────────────────────────────────────

/**
 * Generate a descriptive accessibility label for a creator layer.
 *
 * Format: "{Type} layer, {width}×{height} percent, at {x}%, {y}%, {state}"
 *
 * Example: "Text layer, 40×20 percent, at 50%, 50%, selected, locked"
 */
export function getLayerLabel(layer: CreatorLayer): string {
  const typeLabel = getLayerCategoryLabel(layer.type);
  const parts: string[] = [`${typeLabel} layer`];

  // Size as percentage of canvas
  const widthPct = Math.round(layer.width * 100);
  const heightPct = Math.round(layer.height * 100);
  parts.push(`${widthPct}×${heightPct} percent`);

  // Position as percentage (center-based, 0-100%)
  const xPct = Math.round(layer.x * 100);
  const yPct = Math.round(layer.y * 100);
  parts.push(`at ${xPct}%, ${yPct}%`);

  // Scale (only mention if non-default)
  if (Math.abs(layer.scale - 1) > 0.01) {
    parts.push(`${Math.round(layer.scale * 100)}% scale`);
  }

  // Rotation (only mention if non-zero)
  if (Math.abs(layer.rotation) > 0.5) {
    parts.push(`${Math.round(layer.rotation)}° rotation`);
  }

  // State flags
  if (layer.locked) parts.push('locked');
  if (layer.hidden) parts.push('hidden');

  return parts.join(', ');
}

/**
 * Generate a label for a selected layer that includes its z-order position.
 *
 * @param layer The layer to label.
 * @param zIndex The layer's z-index in the stack.
 * @param totalLayers Total number of layers in the stack.
 */
export function getLayerLabelWithZOrder(
  layer: CreatorLayer,
  zIndex: number,
  totalLayers: number,
): string {
  const base = getLayerLabel(layer);
  return `${base}, layer ${zIndex + 1} of ${totalLayers}`;
}

// ── Tool labels ────────────────────────────────────────────────────────

/**
 * Creator tool identifiers. These match the tool registry IDs.
 */
export type CreatorToolName =
  | 'media'
  | 'text'
  | 'product'
  | 'sticker'
  | 'draw'
  | 'music'
  | 'effects'
  | 'filters'
  | 'adjust'
  | 'trim'
  | 'speed'
  | 'volume'
  | 'transitions'
  | 'captions'
  | 'voiceover'
  | 'audio'
  | 'color'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'duplicate'
  | 'split'
  | 'replace'
  | 'play'
  | 'pause'
  | 'expand'
  | 'collapse'
  | 'eyedropper'
  | 'layers'
  | 'layout'
  | 'safeZone'
  | 'export';

/**
 * Generate an accessibility label for a creator tool button.
 *
 * @param tool The tool identifier.
 * @param isActive Whether the tool is currently active/selected.
 */
export function getToolLabel(tool: CreatorToolName, isActive: boolean = false): string {
  const labels: Record<CreatorToolName, string> = {
    media: 'Add media',
    text: 'Add text',
    product: 'Add product link',
    sticker: 'Add sticker',
    draw: 'Draw',
    music: 'Add music',
    effects: 'Effects',
    filters: 'Filters',
    adjust: 'Adjustments',
    trim: 'Trim clip',
    speed: 'Speed',
    volume: 'Volume',
    transitions: 'Transitions',
    captions: 'Captions',
    voiceover: 'Voiceover',
    audio: 'Audio mixer',
    color: 'Color picker',
    undo: 'Undo',
    redo: 'Redo',
    delete: 'Delete',
    duplicate: 'Duplicate',
    split: 'Split clip',
    replace: 'Replace media',
    play: 'Play',
    pause: 'Pause',
    expand: 'Expand',
    collapse: 'Collapse',
    eyedropper: 'Eyedropper',
    layers: 'Layers',
    layout: 'Layout',
    safeZone: 'Safe zone guide',
    export: 'Export',
  };

  const base = labels[tool] ?? tool;
  return isActive ? `${base}, active` : base;
}

// ── Timeline labels ────────────────────────────────────────────────────

/**
 * Timeline state for label generation.
 */
export interface TimelineLabelState {
  /** Current playhead position in milliseconds. */
  currentTimeMs: number;
  /** Total timeline duration in milliseconds. */
  durationMs: number;
  /** Number of clips in the timeline. */
  clipCount: number;
  /** Whether playback is active. */
  isPlaying: boolean;
}

/**
 * Generate an accessibility label for the timeline as a whole.
 *
 * Example: "Timeline, 2 of 10 seconds, 3 clips, playing"
 */
export function getTimelineLabel(state: TimelineLabelState): string {
  const parts: string[] = ['Timeline'];

  const currentSec = (state.currentTimeMs / 1000).toFixed(1);
  const totalSec = (state.durationMs / 1000).toFixed(1);
  parts.push(`${currentSec} of ${totalSec} seconds`);

  parts.push(`${state.clipCount} ${state.clipCount === 1 ? 'clip' : 'clips'}`);

  if (state.isPlaying) parts.push('playing');

  return parts.join(', ');
}

// ── Color labels ───────────────────────────────────────────────────────

/**
 * Generate an accessibility label for a color value.
 *
 * Includes hex, hue, saturation, and lightness — the information a
 * screen-reader user needs to understand and compare colors.
 *
 * Example: "Red, hex R-R-G-G-B-B, hue 0 degrees, full saturation, 50 percent lightness"
 */
export function getColorLabel(color: CreatorColor): string {
  const hex = toHexString(color).toUpperCase().replace('#', '');
  const hsl = rgbToHsl(color);
  const hueDeg = Math.round(hsl.h);
  const satPct = Math.round(hsl.s * 100);
  const lightPct = Math.round(hsl.l * 100);

  // Color name from hue (approximate)
  const colorName = hueToName(hsl.h, hsl.s, hsl.l);

  // Saturation descriptor
  const satDesc = satPct === 0 ? 'no saturation'
    : satPct === 100 ? 'full saturation'
    : `${satPct} percent saturation`;

  // Lightness descriptor
  const lightDesc = lightPct === 0 ? 'black'
    : lightPct === 100 ? 'white'
    : `${lightPct} percent lightness`;

  // Alpha descriptor (only mention if not fully opaque)
  const alphaPart = color.a < 1
    ? `, ${Math.round(color.a * 100)} percent opacity`
    : '';

  return `${colorName}, hex ${hex.split('').join('-')}, hue ${hueDeg} degrees, ${satDesc}, ${lightDesc}${alphaPart}`;
}

/**
 * Approximate color name from HSL values.
 * Used for the human-readable prefix in getColorLabel.
 */
function hueToName(hue: number, saturation: number, lightness: number): string {
  if (saturation < 0.1) {
    if (lightness < 0.15) return 'Black';
    if (lightness > 0.85) return 'White';
    return 'Gray';
  }

  const h = ((hue % 360) + 360) % 360;
  if (h < 15 || h >= 345) return 'Red';
  if (h < 45) return 'Orange';
  if (h < 75) return 'Yellow';
  if (h < 105) return 'Yellow-green';
  if (h < 165) return 'Green';
  if (h < 195) return 'Cyan';
  if (h < 255) return 'Blue';
  if (h < 285) return 'Purple';
  return 'Magenta';
}

// ── Slider labels ──────────────────────────────────────────────────────

/**
 * Generate an accessibility label for a slider control.
 *
 * @param name Human-readable slider name (e.g. "Speed", "Volume").
 * @param value Current value.
 * @param min Minimum value.
 * @param max Maximum value.
 * @param formatValue Optional formatter for the value display.
 */
export function getSliderLabel(
  name: string,
  value: number,
  min: number,
  max: number,
  formatValue?: (v: number) => string,
): string {
  const formatted = formatValue ? formatValue(value) : String(Math.round(value));
  const formattedMin = formatValue ? formatValue(min) : String(Math.round(min));
  const formattedMax = formatValue ? formatValue(max) : String(Math.round(max));
  return `${name} slider, ${formatted}, range ${formattedMin} to ${formattedMax}`;
}

// ── Canvas container label ─────────────────────────────────────────────

/**
 * Generate an accessibility label for the canvas container itself.
 *
 * @param layerCount Number of visible layers on the canvas.
 * @param mode The canvas mode (edit, preview, view).
 */
export function getCanvasLabel(layerCount: number, mode: 'edit' | 'preview' | 'view'): string {
  const modeLabel = mode === 'edit' ? 'Editor canvas'
    : mode === 'preview' ? 'Preview canvas'
    : 'Canvas';

  if (layerCount === 0) {
    return `${modeLabel}, empty, tap a tool to start`;
  }

  const layerWord = layerCount === 1 ? 'layer' : 'layers';
  return `${modeLabel}, ${layerCount} ${layerWord}`;
}

// ── Accessibility actions for layer selection ──────────────────────────

import type { AccessibilityActionEvent } from 'react-native';

/**
 * Accessibility actions for navigating between layers on the canvas.
 * These are used with the `accessibilityActions` prop on the canvas container.
 */
export const CANVAS_ACCESSIBILITY_ACTIONS = [
  { name: 'selectNextLayer', label: 'Select next layer' },
  { name: 'selectPreviousLayer', label: 'Select previous layer' },
  { name: 'selectTopLayer', label: 'Select top layer' },
  { name: 'selectBottomLayer', label: 'Select bottom layer' },
] as const;

/**
 * Type for canvas accessibility action events.
 */
export type CanvasAccessibilityActionName =
  (typeof CANVAS_ACCESSIBILITY_ACTIONS)[number]['name'];

/**
 * Handle a canvas accessibility action event.
 * Returns the name of the action to perform, or null if unrecognized.
 */
export function handleCanvasAccessibilityAction(
  event: AccessibilityActionEvent,
): CanvasAccessibilityActionName | null {
  const actionName = (event as { actionName?: string }).actionName as CanvasAccessibilityActionName;
  if (CANVAS_ACCESSIBILITY_ACTIONS.some((a) => a.name === actionName)) {
    return actionName;
  }
  return null;
}

// ── Re-export formatTimecode for convenience ───────────────────────────

export { formatTimecode };
