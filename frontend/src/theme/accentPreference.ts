// Accent preference — mirrors themePreference.ts pattern.
// Stores the user's chosen accent preset in AsyncStorage and provides
// a subscribe/notify pattern so ThemeContext can react to changes.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshThemeFromRuntime } from '../constants/colors';

// ── Accent presets ───────────────────────────────────────────────────
//
// Five brand-coherent accent presets. Each defines a brand / brandPressed
// pair for dark and light mode. All presets are muted, luxury-appropriate
// tones — no bright/saturated hues (AGENTS.md §4: restraint as a skill).
//
// The "default" preset matches the original warm off-white (dark) /
// dark neutral (light) that shipped before accent presets existed.

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

const ACCENT_PRESET_MAP: Record<AccentPreset, AccentPresetDefinition> = Object.fromEntries(
  ACCENT_PRESETS.map((p) => [p.id, p]),
) as Record<AccentPreset, AccentPresetDefinition>;

const ACCENT_OVERRIDE_GLOBAL_KEY = '__THRYFTVERSE_ACCENT_OVERRIDE__';

export const ACCENT_PREF_STORAGE_KEY = 'thryftverse:accent-pref:v1';

const DEFAULT_ACCENT_PRESET: AccentPreset = 'default';
const VALID_ACCENT_PRESETS: AccentPreset[] = ['default', 'sage', 'clay', 'slate', 'plum'];
const accentPreferenceSubscribers = new Set<(preset: AccentPreset) => void>();

function parseAccentPreset(rawValue: string | null): AccentPreset {
  if (!rawValue) return DEFAULT_ACCENT_PRESET;
  const normalized = rawValue.trim().toLowerCase();
  return VALID_ACCENT_PRESETS.includes(normalized as AccentPreset)
    ? (normalized as AccentPreset)
    : DEFAULT_ACCENT_PRESET;
}

export async function getStoredAccentPreference(): Promise<AccentPreset> {
  try {
    const raw = await AsyncStorage.getItem(ACCENT_PREF_STORAGE_KEY);
    return parseAccentPreset(raw);
  } catch {
    return DEFAULT_ACCENT_PRESET;
  }
}

export async function setStoredAccentPreference(preset: AccentPreset): Promise<void> {
  await AsyncStorage.setItem(ACCENT_PREF_STORAGE_KEY, preset);
}

export function subscribeAccentPreferenceChange(
  subscriber: (preset: AccentPreset) => void,
): () => void {
  accentPreferenceSubscribers.add(subscriber);
  return () => {
    accentPreferenceSubscribers.delete(subscriber);
  };
}

function notifyAccentPreferenceChange(preset: AccentPreset): void {
  accentPreferenceSubscribers.forEach((subscriber) => {
    try {
      subscriber(preset);
    } catch {
      // Ignore subscriber failures.
    }
  });
}

/**
 * Returns the active accent preset from the runtime override or the default.
 * Called by colors.ts to resolve accent colors for the static `Colors` object.
 */
export function getRuntimeAccentPreset(): AccentPreset {
  const override = (globalThis as Record<string, unknown>)[ACCENT_OVERRIDE_GLOBAL_KEY] as
    | AccentPreset
    | null
    | undefined;
  if (override && VALID_ACCENT_PRESETS.includes(override)) {
    return override;
  }
  return DEFAULT_ACCENT_PRESET;
}

export function applyAccentPreference(preset: AccentPreset): void {
  (globalThis as Record<string, unknown>)[ACCENT_OVERRIDE_GLOBAL_KEY] = preset;
  refreshThemeFromRuntime();
  notifyAccentPreferenceChange(preset);
}

export function getAccentPresetDefinition(preset: AccentPreset): AccentPresetDefinition {
  return ACCENT_PRESET_MAP[preset] ?? ACCENT_PRESET_MAP.default;
}

export function getAccentColors(preset: AccentPreset, isDark: boolean): AccentColors {
  const def = getAccentPresetDefinition(preset);
  return isDark ? def.dark : def.light;
}

export function getAccentPresetLabel(preset: AccentPreset): string {
  return getAccentPresetDefinition(preset).label;
}
