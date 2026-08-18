import { useWindowDimensions } from 'react-native';

/**
 * Window capability classes per Material 3 adaptive guidance.
 * compact:   width < 600  (phones in portrait)
 * medium:    width >= 600 && < 840  (phones in landscape, small tablets)
 * expanded:  width >= 840  (tablets, desktop)
 */
export type WindowClass = 'compact' | 'medium' | 'expanded';

export interface BreakpointState {
  width: number;
  height: number;
  windowClass: WindowClass;
  isCompact: boolean;
  isMedium: boolean;
  isExpanded: boolean;
  /** Commerce detail compact threshold (390px) — screens below this use denser media/layout. */
  isCommerceCompact: boolean;
  /** Very compact threshold (340px) — for very small phones. */
  isVeryCompact: boolean;
}

const COMPACT_THRESHOLD = 600;
const MEDIUM_THRESHOLD = 840;
const COMMERCE_COMPACT_WIDTH = 390;
const VERY_COMPACT_WIDTH = 340;

export function useBreakpoint(): BreakpointState {
  const { width, height } = useWindowDimensions();
  const windowClass: WindowClass =
    width >= MEDIUM_THRESHOLD ? 'expanded' : width >= COMPACT_THRESHOLD ? 'medium' : 'compact';
  return {
    width,
    height,
    windowClass,
    isCompact: windowClass === 'compact',
    isMedium: windowClass === 'medium',
    isExpanded: windowClass === 'expanded',
    isCommerceCompact: width < COMMERCE_COMPACT_WIDTH,
    isVeryCompact: width < VERY_COMPACT_WIDTH,
  };
}
