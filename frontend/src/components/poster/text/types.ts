/**
 * Shared types for the text overlay system.
 *
 * @module types
 */

import type { FontFamily } from './fontRegistry';

export type TextAlignment = 'left' | 'center' | 'right';

export type TextAnimation =
  | 'none'
  | 'fade'
  | 'slide'
  | 'typewriter'
  | 'bounce'
  | 'pop'
  | 'slideDown';

export interface TextLayer {
  id: string;
  text: string;
  color: string;
  fontFamily: FontFamily;
  fontSize: number;
  x: number;
  y: number;
  backgroundColor?: string;
  alignment: TextAlignment;
  rotation: number;
  animation?: TextAnimation;
  shadow?: boolean;
  /** Text stroke (outline) effect */
  strokeEnabled?: boolean;
  /** Stroke width in pixels (1–8) */
  strokeWidth?: number;
  /** Stroke color (hex) */
  strokeColor?: string;
}
