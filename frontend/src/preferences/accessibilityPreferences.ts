import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Accessibility Preferences — persisted user-controlled accessibility settings.
 *
 * These supplement the OS-level accessibility settings (Reduce Motion,
 * Reduce Transparency, Dynamic Type). The OS setting is always canonical
 * for motion and transparency; the in-app setting ORs with it so a user
 * who enables in-app reduced motion gets reduced motion even if the OS
 * setting is off.
 *
 * Per audit 12_ONBOARDING_AUTH_SAFETY_ACCESSIBILITY:
 * - "reduced motion disables non-essential transform/parallax"
 * - "glass/material chrome remains legible under accessibility settings"
 * - "do not encode state by color alone"
 *
 * Per AGENTS.md §11 (Truthful UI): every toggle in the settings screen
 * must perform the represented action. These persisted preferences make
 * the toggles functional, not decorative.
 */

export const ACCESSIBILITY_PREF_STORAGE_KEY = 'thryftverse:accessibility-pref:v1';

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge';

export interface AccessibilityPreferences {
  /** User-selected text size. Supplements OS Dynamic Type. */
  textSize: TextSize;
  /** In-app reduced motion. ORs with OS Reduce Motion. */
  reducedMotion: boolean;
  /** High contrast — strengthens text/background contrast globally. */
  highContrast: boolean;
}

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  textSize: 'medium',
  reducedMotion: false,
  highContrast: false,
};

/**
 * Text size scale factors — multiplies the base font size from design tokens.
 * The OS Dynamic Type setting is independent and applies on top of this.
 */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  small: 0.87,
  medium: 1.0,
  large: 1.13,
  xlarge: 1.27,
};

/** Persist accessibility preferences to AsyncStorage. */
export async function setStoredAccessibilityPreferences(
  prefs: Partial<AccessibilityPreferences>
): Promise<void> {
  try {
    const current = await getStoredAccessibilityPreferences();
    const merged = { ...current, ...prefs };
    await AsyncStorage.setItem(
      ACCESSIBILITY_PREF_STORAGE_KEY,
      JSON.stringify(merged)
    );
  } catch {
    // Best-effort persistence — the app still functions if storage fails.
  }
}

/** Load accessibility preferences from AsyncStorage. */
export async function getStoredAccessibilityPreferences(): Promise<AccessibilityPreferences> {
  try {
    const raw = await AsyncStorage.getItem(ACCESSIBILITY_PREF_STORAGE_KEY);
    if (!raw) return DEFAULT_ACCESSIBILITY_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AccessibilityPreferences>;
    // Merge known keys only — legacy keys from removed preferences (e.g.
    // boldText, screenReaderHints) would otherwise ride the spread and
    // persist in storage indefinitely. Because setStoredAccessibilityPreferences
    // writes back this filtered result, the next save also scrubs the store.
    const textSize: TextSize =
      typeof parsed.textSize === 'string' && parsed.textSize in TEXT_SIZE_SCALE
        ? parsed.textSize
        : DEFAULT_ACCESSIBILITY_PREFERENCES.textSize;
    return {
      textSize,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean'
          ? parsed.reducedMotion
          : DEFAULT_ACCESSIBILITY_PREFERENCES.reducedMotion,
      highContrast:
        typeof parsed.highContrast === 'boolean'
          ? parsed.highContrast
          : DEFAULT_ACCESSIBILITY_PREFERENCES.highContrast,
    };
  } catch {
    return DEFAULT_ACCESSIBILITY_PREFERENCES;
  }
}
