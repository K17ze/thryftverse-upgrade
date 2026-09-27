'use client';

/**
 * useAccent — persisted accent preference for the web app.
 *
 * Contract for the settings surface (owned by another agent):
 *
 *   const { accent, setAccent, presets } = useAccent();
 *   // accent: 'default' | 'sage' | 'clay' | 'slate' | 'plum'
 *   // presets: AccentPresetDefinition[] — render the picker from this,
 *   //          each entry carries label + the four brand swatch colors
 *   //          per theme so the UI can preview without hardcoding hex.
 *
 * The value is mirrored onto `<html data-accent>` by PlatformRuntime and
 * restored pre-paint by the inline script in layout.tsx. `default` clears
 * the attribute — base tokens in globals.css already carry those values.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  isAccentPreset,
  type AccentPreset,
  type AccentPresetDefinition,
} from './accent';

interface AccentState {
  accent: AccentPreset;
  setAccent: (accent: AccentPreset) => void;
}

export const useAccentStore = create<AccentState>()(
  persist(
    (set) => ({
      accent: DEFAULT_ACCENT,
      setAccent: (accent) => {
        if (!isAccentPreset(accent)) return;
        set({ accent });
      },
    }),
    {
      name: ACCENT_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accent: s.accent }),
    },
  ),
);

export interface UseAccent {
  accent: AccentPreset;
  setAccent: (accent: AccentPreset) => void;
  /** All presets — the settings picker should render from this list. */
  presets: AccentPresetDefinition[];
}

export function useAccent(): UseAccent {
  const accent = useAccentStore((s) => s.accent);
  const setAccent = useAccentStore((s) => s.setAccent);
  return { accent, setAccent, presets: ACCENT_PRESETS };
}
