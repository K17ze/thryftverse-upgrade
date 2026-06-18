import React from 'react';
import { View, Text, StyleSheet, ScrollView, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

export interface ProfileTab {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
}

interface ProfileTabRailProps {
  tabs: ProfileTab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function ProfileTabRail({ tabs, activeKey, onChange }: ProfileTabRailProps) {
  const activeIndex = tabs.findIndex((t) => t.key === activeKey);
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  const tabLayouts = React.useRef<Map<number, { x: number; width: number }>>(new Map());

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
    opacity: withSpring(indicatorW.value > 0 ? 1 : 0, { damping: 20, stiffness: 250 }),
  }));

  const updateIndicator = React.useCallback(
    (index: number, animated = true) => {
      const layout = tabLayouts.current.get(index);
      if (!layout) return;
      if (animated) {
        indicatorX.value = withSpring(layout.x, { damping: 18, stiffness: 300 });
        indicatorW.value = withSpring(layout.width, { damping: 18, stiffness: 300 });
      } else {
        indicatorX.value = layout.x;
        indicatorW.value = layout.width;
      }
    },
    [indicatorX, indicatorW]
  );

  React.useEffect(() => {
    updateIndicator(activeIndex, true);
  }, [activeIndex, updateIndicator]);

  return (
    <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.key === activeKey;
          return (
            <AnimatedPressable
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onChange(tab.key)}
              {...PressPresets.tabItem}
              onLayout={(e: LayoutChangeEvent) => {
                const { x, width } = e.nativeEvent.layout;
                tabLayouts.current.set(index, { x, width });
                if (isActive) updateIndicator(index, false);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab${tab.count !== undefined ? `, ${tab.count} items` : ''}`}
            >
              {tab.icon && (
                <Ionicons
                  name={tab.icon}
                  size={18}
                  color={isActive ? Colors.textPrimary : Colors.textMuted}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
              {tab.count !== undefined && (
                <View style={[styles.countPill, isActive && styles.countPillActive]}>
                  <Text style={[styles.countText, isActive && styles.countTextActive]}>{tab.count}</Text>
                </View>
              )}
            </AnimatedPressable>
          );
        })}
        {/* Animated sliding indicator */}
        <Reanimated.View style={[styles.indicator, indicatorStyle]} />
      </ScrollView>
    </Reanimated.View>
  );
}

const TAB_HEIGHT = 44;

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  scroll: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: TAB_HEIGHT,
    borderRadius: Radius.full,
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
    minWidth: 80,
  },
  tabActive: {
    backgroundColor: Colors.surface,
  },
  label: {
    fontFamily: Typography.family.semibold,
    fontSize: 14,
    color: Colors.textMuted,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: Colors.textPrimary,
  },
  countPill: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    marginLeft: 4,
  },
  countPillActive: {
    backgroundColor: Colors.textPrimary,
  },
  countText: {
    fontFamily: Typography.family.semibold,
    fontSize: 11,
    color: Colors.textMuted,
  },
  countTextActive: {
    color: Colors.background,
  },
  indicator: {
    position: 'absolute',
    bottom: Space.sm - 2,
    left: Space.md,
    height: 2.5,
    backgroundColor: Colors.textPrimary,
    borderRadius: 1.25,
  },
});