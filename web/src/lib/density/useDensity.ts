'use client';

/**
 * useDensity — persisted density preference for the web app.
 *
 * Contract for the settings surface (owned by another agent):
 *
 *   const { density, setDensity, config } = useDensity();
 *   // density: 'compact' | 'regular' | 'editorial'
 *   // setDensity(...) persists + restyles the app via [data-density]
 *   // config: the active DensityConfig (rowHeight, gutter, ...)
 *
 * The value is mirrored onto `<html data-density>` by PlatformRuntime
 * (mounted once in layout.tsx) and restored pre-paint by the inline
 * script there, so persisted density applies before first paint.
 *
 * CSS contract — surfaces read `var(--density-*)` (globals.css):
 *   --density-row-height  --density-row-py  --density-row-gap
 *   --density-gutter      --density-section-gap
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_DENSITY,
  DENSITY_STORAGE_KEY,
  densityConfig,
  isDensity,
  type Density,
  type DensityConfig,
} from './density';

interface DensityState {
  density: Density;
  setDensity: (density: Density) => void;
}

export const useDensityStore = create<DensityState>()(
  persist(
    (set) => ({
      density: DEFAULT_DENSITY,
      setDensity: (density) => {
        if (!isDensity(density)) return;
        set({ density });
      },
    }),
    {
      name: DENSITY_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ density: s.density }),
    },
  ),
);

export interface UseDensity {
  density: Density;
  setDensity: (density: Density) => void;
  /** Active geometry config — mirrors frontend DENSITY_CONFIGS. */
  config: DensityConfig;
}

export function useDensity(): UseDensity {
  const density = useDensityStore((s) => s.density);
  const setDensity = useDensityStore((s) => s.setDensity);
  return { density, setDensity, config: densityConfig(density) };
}
