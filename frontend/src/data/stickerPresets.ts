/**
 * Preset data for the StickerPicker component.
 *
 * This module centralises the static preset collections used to populate the
 * shapes, poll, question and countdown tabs of the sticker picker. Keeping
 * these presets in a dedicated data file keeps StickerPicker.tsx focused on
 * UI and interaction logic.
 *
 * Shape swatch colors are sticker payload (persisted with the sticker and
 * rendered over media), so they stay hardcoded rather than mapped to theme
 * tokens.
 */

import type { Ionicons } from '@expo/vector-icons';

/** A shape preset rendered as a coloured icon swatch in the picker. */
export interface ShapePreset {
  /** Ionicons glyph name rendered for the shape. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Human-readable label shown under the swatch. */
  label: string;
  /** Hardcoded hex color persisted as the sticker payload color. */
  color: string;
}

/** A two-option poll preset. */
export interface PollPreset {
  /** The poll question. */
  q: string;
  /** The first option label. */
  o1: string;
  /** The second option label. */
  o2: string;
}

/** A countdown preset expressed in hours. */
export interface CountdownPreset {
  /** Human-readable label for the countdown duration. */
  label: string;
  /** Duration in hours. */
  hours: number;
}

/**
 * Shape swatches available in the shapes tab. Colors are sticker payload and
 * are persisted with the sticker, so they remain hardcoded hex values.
 */
export const SHAPES: ShapePreset[] = [
  { icon: 'heart', label: 'Heart', color: '#7B0E1E' },
  { icon: 'star', label: 'Star', color: '#C9A46A' },
  { icon: 'flash', label: 'Bolt', color: '#8A6A3F' },
  { icon: 'sunny', label: 'Sun', color: '#C9A46A' },
  { icon: 'moon', label: 'Moon', color: '#6B3245' },
  { icon: 'location', label: 'Pin', color: '#9b0202' },
];

/** Two-option poll presets shown in the poll tab. */
export const PRESET_POLLS: PollPreset[] = [
  { q: 'Cop or drop?', o1: 'Cop', o2: 'Drop' },
  { q: 'Worth it?', o1: 'Yes', o2: 'No' },
  { q: 'Size check?', o1: 'TTS', o2: 'Size up' },
];

/** Open-ended question presets shown in the question tab. */
export const PRESET_QUESTIONS: string[] = [
  'Ask me anything',
  'Rate this fit',
  'Guess the price',
  'Where from?',
];

/** Countdown duration presets shown in the countdown tab. */
export const COUNTDOWN_PRESETS: CountdownPreset[] = [
  { label: '1 Hour', hours: 1 },
  { label: '6 Hours', hours: 6 },
  { label: '12 Hours', hours: 12 },
  { label: '24 Hours', hours: 24 },
  { label: '3 Days', hours: 72 },
  { label: '1 Week', hours: 168 },
];
