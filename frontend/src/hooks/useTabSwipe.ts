import { useMemo, useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

// ───────────────────────────────────────────────────────────────────────────
// useTabSwipe — horizontal swipe-to-switch-tab gesture for TabNavigator.
//
// Uses manualActivation so horizontal carousels and ScrollViews inside each
// tab can claim the gesture first. Only activates on a decisive horizontal
// drag (|dx| > 24, |dy| < 24). Respects guest gating (skips Inbox/Profile)
// and skips the Create tab (it is an action, not a destination).
//
// Reduced-motion: no visual pan follow — the tab switch is instant.
// ───────────────────────────────────────────────────────────────────────────

export interface UseTabSwipeOptions {
  /** Ordered list of navigable tab names (excludes Create). */
  tabs: string[];
  /** Current active tab name. */
  activeTab: string;
  /** Navigate to a tab by name. */
  navigateToTab: (tab: string) => void;
  /** Tabs that are gated for guest users (won't be navigated to). */
  gatedTabs?: Set<string>;
}

export function useTabSwipe({
  tabs,
  activeTab,
  navigateToTab,
  gatedTabs,
}: UseTabSwipeOptions) {
  const goToTab = useCallback(
    (direction: -1 | 1) => {
      const currentIdx = tabs.indexOf(activeTab);
      if (currentIdx === -1) return;
      const nextIdx = currentIdx + direction;
      if (nextIdx < 0 || nextIdx >= tabs.length) return;
      const nextTab = tabs[nextIdx];
      if (!nextTab) return;
      if (gatedTabs?.has(nextTab)) return;
      navigateToTab(nextTab);
    },
    [tabs, activeTab, navigateToTab, gatedTabs],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesMove((event, stateManager) => {
          'worklet';
          const touch = event.changedTouches[0];
          if (!touch) {
            stateManager.fail();
            return;
          }
          // Only activate on a decisive horizontal drag. Vertical movement
          // yields to the inner ScrollView; small movements yield to
          // horizontal carousels.
          const dx = Math.abs(touch.x - (touch as any).absoluteX);
          const dy = Math.abs(touch.y - (touch as any).absoluteY);
          if (dx > 24 && dy < 24) {
            stateManager.activate();
          } else if (dy > 24) {
            stateManager.fail();
          }
        })
        .onEnd((e) => {
          'worklet';
          const threshold = 40;
          const fast = Math.abs(e.velocityX) > 600;
          if (e.translationX > threshold || (fast && e.velocityX > 0)) {
            runOnJS(goToTab)(-1);
          } else if (e.translationX < -threshold || (fast && e.velocityX < 0)) {
            runOnJS(goToTab)(1);
          }
        }),
    [goToTab],
  );

  return panGesture;
}
