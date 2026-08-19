import React from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Type, Radius } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type OrdersTab = 'all' | 'buying' | 'selling' | 'completed';

interface OrdersTabRailProps {
  activeTab: OrdersTab;
  allCount?: number;
  buyingCount: number;
  sellingCount: number;
  completedCount?: number;
  onChange: (tab: OrdersTab) => void;
}

type TabLayout = { x: number; width: number };

export function OrdersTabRail({
  activeTab,
  allCount = 0,
  buyingCount,
  sellingCount,
  completedCount = 0,
  onChange,
}: OrdersTabRailProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const tabs: { key: OrdersTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allCount },
    { key: 'buying', label: 'Buying', count: buyingCount },
    { key: 'selling', label: 'Selling', count: sellingCount },
    { key: 'completed', label: 'Completed', count: completedCount },
  ];

  // Per-tab measured layout (x offset + width) so the shared indicator can
  // slide precisely under the active tab. Captured via onLayout.
  const tabLayouts = React.useRef<Record<string, TabLayout>>({});
  const indicatorTranslateX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  // Drive the indicator whenever the active tab changes or its layout is
  // measured. Uses Motion.spring.indicator for a controlled, overshoot-free
  // slide; under reduced motion the value is set directly (no travel).
  const moveIndicator = React.useCallback(
    (key: OrdersTab) => {
      const layout = tabLayouts.current[key];
      if (!layout) return;
      if (reducedMotion) {
        indicatorTranslateX.value = layout.x;
        indicatorWidth.value = layout.width;
      } else {
        indicatorTranslateX.value = withSpring(layout.x, Motion.spring.indicator);
        indicatorWidth.value = withSpring(layout.width, Motion.spring.indicator);
      }
    },
    [reducedMotion, indicatorTranslateX, indicatorWidth],
  );

  React.useEffect(() => {
    moveIndicator(activeTab);
  }, [activeTab, moveIndicator]);

  const handleTabLayout = (key: OrdersTab) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[key] = { x, width };
    // If this is the active tab, snap the indicator to it immediately on
    // first measurement so it never starts at x=0.
    if (key === activeTab) {
      moveIndicator(key);
    }
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorTranslateX.value }],
    width: indicatorWidth.value,
  }));

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => onChange(tab.key)}
            onLayout={handleTabLayout(tab.key)}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab${tab.count > 0 ? `, ${tab.count} orders` : ''}`}
          >
            <Text
              style={[
                styles.tabText,
                isActive && styles.tabTextActive,
              ]}
            >
              {tab.label} {tab.count > 0 ? tab.count : ''}
            </Text>
          </Pressable>
        );
      })}
      {/* Shared sliding indicator — a single Animated.View that translates
          between tabs instead of remounting a static underline per tab. */}
      <Reanimated.View
        pointerEvents="none"
        style={[styles.tabUnderline, indicatorStyle]}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: 2,
    gap: Space.md + Space.xs,
  },
  tab: {
    paddingVertical: Space.sm,
    alignItems: 'flex-start',
  },
  tabText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  tabTextActive: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  // Shared underline — positioned at the bottom of the rail, left-aligned
  // with the first tab. The animated style drives translateX + width so it
  // slides under whichever tab is active.
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: Space.md,
    height: 2,
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.full,
  },
});
