import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Stroke } from '../../../theme/designTokens';
import { haptics } from '../../../utils/haptics';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

export type CoOwnDetailTab = 'overview' | 'market' | 'ownership';

export interface CoOwnSegmentNavProps {
  activeTab: CoOwnDetailTab;
  onTabChange: (tab: CoOwnDetailTab) => void;
  hasActiveOrders?: boolean;
  hasUnclaimedDistributions?: boolean;
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
 * Reduced motion: instant underline assignment, no timing animation.
 */
export function CoOwnSegmentNav({
  activeTab,
  onTabChange,
  hasActiveOrders,
  hasUnclaimedDistributions,
}: CoOwnSegmentNavProps) {
  const { colors } = useAppTheme();
  const reducedMotionHook = useReducedMotion();
  const tabWidths = useRef<Record<string, number>>({});
  const tabOffsets = useRef<Record<string, number>>({});
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
    onTabChange(tab);
  }, [activeTab, positionUnderline, onTabChange]);

  React.useEffect(() => {
    positionUnderline(activeTab);
  }, [activeTab, positionUnderline]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineTranslateX.value }],
    width: underlineWidth.value,
  }));

  return (
    <View style={[styles.container, { borderBottomColor: colors.borderSubtle }]}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const showBadge = (tab.key === 'market' && hasActiveOrders) || (tab.key === 'ownership' && hasUnclaimedDistributions);

        return (
          <Pressable
            key={tab.key}
            onLayout={onTabLayout(tab.key)}
            onPress={() => handleSelect(tab.key)}
            style={({ pressed }) => [styles.tabButton, pressed && { opacity: 0.6 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} section`}
          >
            <View style={styles.tabContent}>
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.textPrimary : colors.textMuted,
                    fontFamily: isActive ? FontFamily.semibold : FontFamily.medium,
                  },
                ]}
                maxFontSizeMultiplier={1.2}
              >
                {tab.label}
              </Text>
              {showBadge ? (
                <View style={[styles.dotBadge, { backgroundColor: colors.brand }]} />
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
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
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
