/**
 * Accent presets — 1:1 port of frontend/src/theme/accentPreference.ts.
 *
 * Five brand-coherent presets. Each defines the brand token quad
 * (brand / brandPressed / brandSubtle / brandBorder) for dark and light
 * themes. All presets are muted, luxury-appropriate tones — no bright or
 * saturated hues (AGENTS.md §4: restraint as a skill).
 *
 * The active preset is applied as `data-accent` on <html> and the CSS var
 * overrides live in globals.css (`[data-accent="…"]` blocks, per theme).
 * `default` maps to the base tokens, so no attribute is written for it.
 */
export type AccentPreset = 'default' | 'sage' | 'clay' | 'slate' | 'plum';

export interface AccentColors {
  brand: string;
  brandPressed: string;
  brandSubtle: string;
  brandBorder: string;
}

export interface AccentPresetDefinition {
  id: AccentPreset;
  label: string;
  dark: AccentColors;
  light: AccentColors;
}

export const ACCENT_PRESETS: AccentPresetDefinition[] = [
  {
    id: 'default',
    label: 'Warm Neutral',
    dark: {
      brand: '#F4F0E8',
      brandPressed: '#D8D0C3',
      brandSubtle: 'rgba(244,240,232,0.08)',
      brandBorder: 'rgba(244,240,232,0.20)',
    },
    light: {
      brand: '#111111',
      brandPressed: '#333333',
      brandSubtle: 'rgba(17,17,17,0.06)',
      brandBorder: 'rgba(17,17,17,0.16)',
    },
  },
  {
    id: 'sage',
    label: 'Sage',
    dark: {
      brand: '#8B9D83',
      brandPressed: '#7A8C72',
      brandSubtle: 'rgba(139,157,131,0.10)',
      brandBorder: 'rgba(139,157,131,0.22)',
    },
    light: {
      brand: '#3D4F37',
      brandPressed: '#33422E',
      brandSubtle: 'rgba(61,79,55,0.08)',
      brandBorder: 'rgba(61,79,55,0.18)',
    },
  },
  {
    id: 'clay',
    label: 'Clay',
    dark: {
      brand: '#C4956C',
      brandPressed: '#B0855E',
      brandSubtle: 'rgba(196,149,108,0.10)',
      brandBorder: 'rgba(196,149,108,0.22)',
    },
    light: {
      brand: '#8B5E3C',
      brandPressed: '#7A5234',
      brandSubtle: 'rgba(139,94,60,0.08)',
      brandBorder: 'rgba(139,94,60,0.18)',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    dark: {
      brand: '#8B9DAE',
      brandPressed: '#7A8C9D',
      brandSubtle: 'rgba(139,157,174,0.10)',
      brandBorder: 'rgba(139,157,174,0.22)',
    },
    light: {
      brand: '#3D5566',
      brandPressed: '#334858',
      brandSubtle: 'rgba(61,85,102,0.08)',
      brandBorder: 'rgba(61,85,102,0.18)',
    },
  },
  {
    id: 'plum',
    label: 'Plum',
    dark: {
      brand: '#9A7B8E',
      brandPressed: '#8A6B7E',
      brandSubtle: 'rgba(154,123,142,0.10)',
      brandBorder: 'rgba(154,123,142,0.22)',
    },
    light: {
      brand: '#5C3D4F',
      brandPressed: '#4E3343',
      brandSubtle: 'rgba(92,61,79,0.08)',
      brandBorder: 'rgba(92,61,79,0.18)',
    },
  },
];

export const ACCENT_STORAGE_KEY = 'thryftverse.web.accent';
export const DEFAULT_ACCENT: AccentPreset = 'default';

export function isAccentPreset(value: unknown): value is AccentPreset {
  return (
    value === 'default' ||
    value === 'sage' ||
    value === 'clay' ||
    value === 'slate' ||
    value === 'plum'
  );
}

export function getAccentPreset(id: AccentPreset): AccentPresetDefinition {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}
