import { useWindowDimensions } from 'react-native';
import { Space } from '../../theme/designTokens';

export interface AuctionHomeLayout {
  width: number;
  fullWidth: number;
  gridCardWidth: number;
  categoryCardWidth: number;
  isSmallWidth: boolean;
  featuredWidth: number;
  supportingColumnWidth: number;
}

/**
 * Width-derived layout metrics for the auction home compositions.
 * Single source for the grid/featured/category card geometry so every
 * composition computes the same widths from the same viewport.
 */
export function useAuctionHomeLayout(): AuctionHomeLayout {
  const { width } = useWindowDimensions();
  const fullWidth = width - Space.md * 2;
  const gridCardWidth = (width - Space.md * 2 - Space.sm) / 2;
  const categoryCardWidth = (width - Space.md * 2 - Space.sm * 2) / 3;
  const isSmallWidth = width < 360;
  const featuredWidth = isSmallWidth ? fullWidth : fullWidth * 0.62;
  const supportingColumnWidth = isSmallWidth ? 0 : fullWidth - featuredWidth - Space.sm;
  return {
    width,
    fullWidth,
    gridCardWidth,
    categoryCardWidth,
    isSmallWidth,
    featuredWidth,
    supportingColumnWidth };
}
