import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import {
  createGalleriaStyles,
  type GalleriaStyles } from '../../components/galleria/galleriaStyles';

/**
 * Theme + dimension-aware stylesheet for the Galleria surface.
 * Mirrors the original screen-local `useStyles()` — every component that
 * called it now calls this hook instead, with identical memo semantics.
 */
export function useGalleriaStyles(): GalleriaStyles {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const heroHeight = Math.round(SCREEN_W * (4 / 5));
  const featuredCollectionHeight = Math.round(SCREEN_W * (5 / 6));
  return useMemo(
    () =>
      createGalleriaStyles(colors, {
        heroHeight,
        featuredCollectionHeight }),
    [colors, heroHeight, featuredCollectionHeight],
  );
}
