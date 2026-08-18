/**
 * Font registry for the text overlay system.
 *
 * Expands from 4 Inter weights to 17 distinct typefaces spanning sans, serif,
 * display, handwriting, mono, and decorative categories — matching the breadth
 * of Instagram's font picker.
 *
 * Fonts are loaded in App.tsx via useFonts(). System fonts (Helvetica, Georgia,
 * etc.) use the platform's built-in typeface and require no loading.
 *
 * @module fontRegistry
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type FontFamily =
  // Original Inter weights (backward-compatible)
  | 'bold'
  | 'classic'
  | 'modern'
  | 'typewriter'
  // Display / Impact
  | 'anton'
  | 'bebas'
  | 'impact'
  // Serif
  | 'playfair'
  | 'georgia'
  | 'times'
  // Handwriting
  | 'caveat'
  | 'pacifico'
  | 'dancing'
  // Decorative
  | 'lobster'
  | 'pressstart'
  // Sans (system)
  | 'system'
  | 'helvetica'
  // Mono
  | 'courier';

export type FontCategory =
  | 'sans'
  | 'serif'
  | 'display'
  | 'handwriting'
  | 'mono'
  | 'decorative';

// ── Font map: FontFamily → CSS fontFamily string ────────────────────────────

/**
 * Maps each FontFamily key to the CSS fontFamily value used by Text/TextInput.
 * Custom fonts use the expo-google-fonts asset name; system fonts use the
 * platform font name directly.
 */
export const FONT_MAP: Record<FontFamily, string> = {
  // Inter weights (backward-compatible)
  bold: 'Inter_700Bold',
  classic: 'Inter_600SemiBold',
  modern: 'Inter_500Medium',
  typewriter: 'Inter_400Regular',
  // Display / Impact
  anton: 'Anton_400Regular',
  bebas: 'BebasNeue_400Regular',
  impact: 'Impact',
  // Serif
  playfair: 'PlayfairDisplay_400Regular',
  georgia: 'Georgia',
  times: 'Times New Roman',
  // Handwriting
  caveat: 'Caveat_400Regular',
  pacifico: 'Pacifico_400Regular',
  dancing: 'DancingScript_400Regular',
  // Decorative
  lobster: 'Lobster_400Regular',
  pressstart: 'PressStart2P_400Regular',
  // Sans (system)
  system: 'System',
  helvetica: 'Helvetica',
  // Mono
  courier: 'Courier New',
};

// ── Font options for the picker UI ──────────────────────────────────────────

export interface FontOption {
  key: FontFamily;
  label: string;
  category: FontCategory;
  /** Short preview text rendered in the font itself */
  preview: string;
}

/**
 * 17 font options organised by category. Each option includes a preview
 * sample that is rendered in the font itself in the picker UI.
 */
export const FONT_OPTIONS: FontOption[] = [
  // Sans
  { key: 'system', label: 'System', category: 'sans', preview: 'Aa' },
  { key: 'helvetica', label: 'Helvetica', category: 'sans', preview: 'Aa' },
  { key: 'bold', label: 'Strong', category: 'sans', preview: 'Aa' },
  { key: 'classic', label: 'Classic', category: 'sans', preview: 'Aa' },
  { key: 'modern', label: 'Modern', category: 'sans', preview: 'Aa' },
  { key: 'typewriter', label: 'Mono', category: 'sans', preview: 'Aa' },
  // Display
  { key: 'anton', label: 'Anton', category: 'display', preview: 'Aa' },
  { key: 'bebas', label: 'Bebas', category: 'display', preview: 'Aa' },
  { key: 'impact', label: 'Impact', category: 'display', preview: 'Aa' },
  // Serif
  { key: 'playfair', label: 'Playfair', category: 'serif', preview: 'Aa' },
  { key: 'georgia', label: 'Georgia', category: 'serif', preview: 'Aa' },
  { key: 'times', label: 'Times', category: 'serif', preview: 'Aa' },
  // Handwriting
  { key: 'caveat', label: 'Caveat', category: 'handwriting', preview: 'Aa' },
  { key: 'pacifico', label: 'Pacifico', category: 'handwriting', preview: 'Aa' },
  { key: 'dancing', label: 'Dancing', category: 'handwriting', preview: 'Aa' },
  // Decorative
  { key: 'lobster', label: 'Lobster', category: 'decorative', preview: 'Aa' },
  { key: 'pressstart', label: 'Pixel', category: 'decorative', preview: 'Aa' },
  // Mono
  { key: 'courier', label: 'Courier', category: 'mono', preview: 'Aa' },
];

// ── Category labels for grouped display ─────────────────────────────────────

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Script',
  mono: 'Mono',
  decorative: 'Fun',
};

// ── Size constants ──────────────────────────────────────────────────────────

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 72;
export const FONT_SIZE_DEFAULT = 24;

export const STROKE_WIDTH_MIN = 1;
export const STROKE_WIDTH_MAX = 8;
export const STROKE_WIDTH_DEFAULT = 2;
