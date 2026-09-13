import { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';

/**
 * Parallax scroll position + handler for the owner-profile cover.
 * Extracted from MyProfileScreen — the cover reads `scrollY` to drive its
 * translate/scale interpolation.
 */
export function useMyProfileScroll() {
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    } });

  return { scrollY, scrollHandler };
}
