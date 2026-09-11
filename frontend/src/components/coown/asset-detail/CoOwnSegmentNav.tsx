import React, { useRef, useCallback, createContext, useContext } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Stroke } from '../../../theme/designTokens';
import { FontFamily } from '../../../theme/fontFamily';
import { TypographyV2 } from '../../../theme/typography.v2';
import { haptics } from '../../../utils/haptics';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

export type CoOwnDetailTab = 'overview' | 'market' | 'ownership';

export interface CoOwnSegmentNavProps {
  activeTab: CoOwnDetailTab;
  onTabChange: (tab: CoOwnDetailTab) => void;
  hasActiveOrders?: boolean;
  /** U13: Only pass true when there is an *actionable* distribution —
   * one the viewer can actually claim — not merely any unsettled event.
   * A 'pending' or 'processing' distribution that the viewer cannot
   * yet act on should NOT light the dot.  The parent (AssetDetailScreen)
   * is responsible for refining this condition; this component trusts
   * the prop and renders the dot when true. */
  hasUnclaimedDistributions?: boolean;
}

/**
 * U12: Scroll context for per-tab scroll restoration.  The parent
 * ScrollView (AssetDetailScreen) can provide a `scrollToY` function
 * via this context so that tab switches bring the nav rail back into
 * view.  When no provider wraps the tree, the default is a no-op —
 * the nav still functions, it just cannot programmatically scroll
 * the shared parent.  This keeps the component self-contained while
 * allowing the orchestrator to opt in without a prop-drill.
 */
export const CoOwnScrollContext = createContext<{ scrollToY: (y: number) => void }>({
  scrollToY: () => {},
});

/** Convenience hook for consuming the scroll context. */
export function useCoOwnScroll() {
  return useContext(CoOwnScrollContext);
}

interface TabOption {
  key: CoOwnDetailTab;
  label: string;
  badge?: boolean;
}

const TABS: TabOption[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'market', label: 'Market' },
  { key: 'ownership', label: 'Ownership' },
];

const TAB_HEIGHT = 44;
const TIMING_CONFIG = { duration: 220, easing: Easing.out(Easing.cubic) };

/**
 * Editorial tab rail for the Co-Own detail sections — same visual language
 * as the profile TabRail (Listings/Looks/About/Reviews) and the home feed
 * tabs (For you/Following): text labels on the canvas, hairline bottom
 * border, and one shared animated underline that glides between tabs.
 *
 * U62 — Text scaling: tab labels use maxFontSizeMultiplier={1.3} so they
 * remain readable at large text sizes without breaking the 44pt hit
 * target.  The label is allowed to grow; the tab height is fixed at 44pt
 * for the hit area (U63) while the text centres within it.
 *
 * U63 — Control targets: every tab is a full 44pt height Pressable with
 * flex:1 width.  The visual glyph (text label) can be smaller; the hit
 * area is the full tab envelope.  No hitSlop is needed because the
 * Pressable already fills the target.
 *
 * U65 — Motion preservation:
 *   - Interruptible: Reanimated's withTiming is naturally interruptible —
 *     selecting a new tab mid-animation cancels the previous tween and
 *     starts from the current position.  No cancel() or flag needed.
 *   - Stable readout: the underline is the only animated element; tab
 *     labels and badges do not animate, so the selection readout stays
 *     stable during the glide.
 *   - Reduced motion: when reducedMotionHook is true, the underline
 *     snaps instantly (no withTiming).  No page-wide animation on
 *     refresh — the segment nav does not animate on data refresh;
 *     only the underline responds to tab selection.
 */
export function CoOwnSegmentNav({
  activeTab,
  onTabChange,
  hasActiveOrders,
  hasUnclaimedDistributions,
}: CoOwnSegmentNavProps) {
  const { colors } = useAppTheme();
  const reducedMotionHook = useReducedMotion();
  const { scrollToY } = useCoOwnScroll();
  const tabWidths = useRef<Record<string, number>>({});
  const tabOffsets = useRef<Record<string, number>>({});
  // U12: track the nav's Y offset within the shared scroll content so
  // a tab switch can scroll the parent back to the nav's position,
  // ensuring the selected section begins visibly without surprising
  // jumps from a deep scroll position in the previous tab.
  const navYRef = useRef(0);
  const underlineTranslateX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  const measureTabs = useCallback(() => {
    let offsetX = 0;
    for (const tab of TABS) {
      tabOffsets.current[tab.key] = offsetX;
      offsetX += tabWidths.current[tab.key] ?? 0;
    }
  }, []);

  const positionUnderline = useCallback((key: string) => {
    measureTabs();
    const tabW = tabWidths.current[key] ?? 0;
    const offsetX = tabOffsets.current[key] ?? 0;
    const underlineW = tabW * 0.4;
    const targetX = offsetX + (tabW - underlineW) / 2;
    if (reducedMotionHook) {
      underlineTranslateX.value = targetX;
      underlineWidth.value = underlineW;
    } else {
      underlineTranslateX.value = withTiming(targetX, TIMING_CONFIG);
      underlineWidth.value = withTiming(underlineW, TIMING_CONFIG);
    }
  }, [measureTabs, reducedMotionHook, underlineTranslateX, underlineWidth]);

  const onTabLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    tabWidths.current[key] = e.nativeEvent.layout.width;
    if (key === activeTab) {
      positionUnderline(key);
    }
  }, [activeTab, positionUnderline]);

  const handleSelect = useCallback((tab: CoOwnDetailTab) => {
    if (tab === activeTab) return;
    haptics.selection();
    positionUnderline(tab);
    // U12: scroll the shared parent so the nav rail (and the newly
    // selected section beneath it) begins visibly.  When no scroll
    // provider is present this is a harmless no-op.
    scrollToY(navYRef.current);
    onTabChange(tab);
  }, [activeTab, positionUnderline, onTabChange, scrollToY]);

  React.useEffect(() => {
    positionUnderline(activeTab);
  }, [activeTab, positionUnderline]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineTranslateX.value }],
    width: underlineWidth.value,
  }));

  return (
    <View
      style={[styles.container, { borderBottomColor: colors.borderSubtle }]}
      onLayout={(e) => {
        // U12: record the nav's Y offset within the scroll content.
        navYRef.current = e.nativeEvent.layout.y;
      }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const showBadge = (tab.key === 'market' && hasActiveOrders) || (tab.key === 'ownership' && hasUnclaimedDistributions);
        // U13: describe what the dot means so screen readers announce
        // the actionable state, not just "dot".
        const badgeA11yLabel =
          tab.key === 'market'
            ? 'You have active orders'
            : tab.key === 'ownership'
              ? 'You have an actionable distribution to claim'
              : undefined;
        // Badge colour encodes the type of actionable state: brand for
        // open orders, warning for claimable distributions.
        const badgeColor = tab.key === 'ownership' ? colors.warning : colors.brand;
        // Anti-AI type budget: both states share the `body` 14pt size so the
        // first viewport stays within the three-size cap. Active vs inactive
        // is differentiated by weight (semibold vs regular) and color only;
        // the 2pt animated underline is the primary selection indicator.
        const tabType = TypographyV2.body;

        return (
          <Pressable
            key={tab.key}
            onLayout={onTabLayout(tab.key)}
            onPress={() => handleSelect(tab.key)}
            style={({ pressed }) => [styles.tabButton, pressed && { opacity: 0.6 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} section${showBadge && badgeA11yLabel ? `, ${badgeA11yLabel}` : ''}`}
            accessibilityHint={isActive ? 'Currently selected' : `Switch to ${tab.label}`}
          >
            <View style={styles.tabContent}>
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.textPrimary : colors.textSecondary,
                    fontSize: tabType.size,
                    lineHeight: tabType.lineHeight,
                    fontFamily: isActive ? FontFamily.semibold : FontFamily.regular,
                  },
                ]}
                maxFontSizeMultiplier={1.3}
              >
                {tab.label}
              </Text>
              {showBadge ? (
                <View
                  style={[styles.dotBadge, { backgroundColor: badgeColor }]}
                  accessibilityLabel={badgeA11yLabel}
                  accessibilityRole="text"
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
      {/* One shared animated underline — no remounting per tab */}
      <Reanimated.View style={[styles.tabUnderline, { backgroundColor: colors.brand }, underlineStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  tabButton: {
    flex: 1,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  tabText: {
    // fontSize / lineHeight are set inline from TypographyV2.body (14/20) for
    // both states; only fontFamily varies (semibold when active, regular when
    // inactive) so the first viewport stays within the three-type-size cap.
  },
  dotBadge: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    borderRadius: Radius.sm,
  },
});
