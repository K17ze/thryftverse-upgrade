import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BROWSE_GRID_DENSITY_PREF_KEY = 'thryftverse:browse-grid-density:v1';

export type GridDensity = 'comfortable' | 'compact';

/**
 * Grid density preference for the browse masonry grid — restores the stored
 * density on mount and persists every change. Extracted verbatim from
 * BrowseScreen.
 */
export function useBrowseGridDensity() {
  const [gridDensity, setGridDensity] = useState<GridDensity>('comfortable');

  useEffect(() => {
    AsyncStorage.getItem(BROWSE_GRID_DENSITY_PREF_KEY).then((stored) => {
      if (stored === 'comfortable' || stored === 'compact') {
        setGridDensity(stored);
      }
    }).catch(() => {});
  }, []);

  const handleGridDensityChange = useCallback((density: GridDensity) => {
    setGridDensity(density);
    AsyncStorage.setItem(BROWSE_GRID_DENSITY_PREF_KEY, density).catch(() => {});
  }, []);

  return { gridDensity, handleGridDensityChange };
}
