import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  useDerivedValue,
  interpolateColor,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;

const TAB_HEIGHT = 44;
const SPRING_CONFIG = { damping: 18, stiffness: 260, mass: 1 };
const REDUCED_TIMING = 180;

export type TabKey = 'Shop' | 'Looks' | 'Reviews';
export type SegmentKey = 'forsale' | 'sold';

interface TabRailProps {
  tabs: { key: TabKey; label: string; count?: number }[];
  activeKey: TabKey;
  onChange: (key: TabKey) => void;
  reducedMotion?: boolean;
}

/**
 * Canonical tab rail with one shared animated underline.
 * Used by both inline (list header) and sticky (overlay) states.
 * The underline moves between tab positions with a spring transition.
 */
export function TabRail({ tabs, activeKey, onChange, reducedMotion = false }: TabRailProps) {
  const tabWidths = useRef<Record<string, number>>({});
  const underlineTranslateX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  const onTabLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    tabWidths.current[key] = e.nativeEvent.layout.width;
    if (key === activeKey) {
      underlineWidth.value = reducedMotion
        ? withTiming(e.nativeEvent.layout.width * 0.4, { duration: REDUCED_TIMING })
        : withSpring(e.nativeEvent.layout.width * 0.4, SPRING_CONFIG);
    }
  }, [activeKey, underlineWidth, reducedMotion]);

  const handlePress = useCallback((key: TabKey) => {
    const width = tabWidths.current[key] ?? 0;
    // Calculate the center of the pressed tab to position the underline
    let offsetX = 0;
    for (const tab of tabs) {
      if (tab.key === key) break;
      offsetX += tabWidths.current[tab.key] ?? 0;
    }
    const tabW = tabWidths.current[key] ?? 0;
    const underlineW = tabW * 0.4;
    underlineTranslateX.value = reducedMotion
      ? withTiming(offsetX + (tabW - underlineW) / 2, { duration: REDUCED_TIMING })
      : withSpring(offsetX + (tabW - underlineW) / 2, SPRING_CONFIG);
    underlineWidth.value = reducedMotion
      ? withTiming(underlineW, { duration: REDUCED_TIMING })
      : withSpring(underlineW, SPRING_CONFIG);
    onChange(key);
  }, [tabs, onChange, underlineTranslateX, underlineWidth, reducedMotion]);

  // Initialize underline position on mount / activeKey change
  React.useEffect(() => {
    let offsetX = 0;
    for (const tab of tabs) {
      if (tab.key === activeKey) break;
      offsetX += tabWidths.current[tab.key] ?? 0;
    }
    const tabW = tabWidths.current[activeKey] ?? 0;
    const underlineW = tabW * 0.4;
    underlineTranslateX.value = reducedMotion
      ? withTiming(offsetX + (tabW - underlineW) / 2, { duration: REDUCED_TIMING })
      : withSpring(offsetX + (tabW - underlineW) / 2, SPRING_CONFIG);
    underlineWidth.value = reducedMotion
      ? withTiming(underlineW, { duration: REDUCED_TIMING })
      : withSpring(underlineW, SPRING_CONFIG);
  }, [activeKey, tabs, underlineTranslateX, underlineWidth, reducedMotion]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineTranslateX.value }],
    width: underlineWidth.value,
  }));

  return (
    <View style={styles.tabRail}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onLayout={onTabLayout(tab.key)}
            onPress={() => handlePress(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab${tab.count !== undefined ? `, ${tab.count} items` : ''}`}
          >
            <View style={styles.tabContent}>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              {tab.count !== undefined ? (
                <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>{tab.count}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
      {/* One shared animated underline — no remounting per tab */}
      <Reanimated.View style={[styles.tabUnderline, underlineStyle]} />
    </View>
  );
}

interface SegmentedControlProps {
  segments: { key: SegmentKey; label: string }[];
  activeKey: SegmentKey;
  onChange: (key: SegmentKey) => void;
  reducedMotion?: boolean;
}

/**
 * Editorial text segment for For sale / Sold. Quieter equivalent to TabRail.
 * Uses a simple underline that fades between segments.
 */
export function SegmentedControl({ segments, activeKey, onChange, reducedMotion = false }: SegmentedControlProps) {
  const segWidths = useRef<Record<string, number>>({});
  const segUnderlineX = useSharedValue(0);
  const segUnderlineW = useSharedValue(0);

  const onSegLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    segWidths.current[key] = e.nativeEvent.layout.width;
    if (key === activeKey) {
      segUnderlineW.value = reducedMotion
        ? withTiming(e.nativeEvent.layout.width, { duration: REDUCED_TIMING })
        : withSpring(e.nativeEvent.layout.width, SPRING_CONFIG);
    }
  }, [activeKey, segUnderlineW, reducedMotion]);

  const handleSegPress = useCallback((key: SegmentKey) => {
    let offsetX = 0;
    for (const seg of segments) {
      if (seg.key === key) break;
      offsetX += segWidths.current[seg.key] ?? 0;
    }
    const segW = segWidths.current[key] ?? 0;
    segUnderlineX.value = reducedMotion
      ? withTiming(offsetX, { duration: REDUCED_TIMING })
      : withSpring(offsetX, SPRING_CONFIG);
    segUnderlineW.value = reducedMotion
      ? withTiming(segW, { duration: REDUCED_TIMING })
      : withSpring(segW, SPRING_CONFIG);
    onChange(key);
  }, [segments, onChange, segUnderlineX, segUnderlineW, reducedMotion]);

  React.useEffect(() => {
    let offsetX = 0;
    for (const seg of segments) {
      if (seg.key === activeKey) break;
      offsetX += segWidths.current[seg.key] ?? 0;
    }
    const segW = segWidths.current[activeKey] ?? 0;
    segUnderlineX.value = reducedMotion
      ? withTiming(offsetX, { duration: REDUCED_TIMING })
      : withSpring(offsetX, SPRING_CONFIG);
    segUnderlineW.value = reducedMotion
      ? withTiming(segW, { duration: REDUCED_TIMING })
      : withSpring(segW, SPRING_CONFIG);
  }, [activeKey, segments, segUnderlineX, segUnderlineW, reducedMotion]);

  const segUnderlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: segUnderlineX.value }],
    width: segUnderlineW.value,
  }));

  return (
    <View style={styles.segmentControl}>
      {segments.map((seg) => {
        const isActive = seg.key === activeKey;
        return (
          <Pressable
            key={seg.key}
            style={styles.segment}
            onLayout={onSegLayout(seg.key)}
            onPress={() => handleSegPress(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={seg.label}
          >
            <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>{seg.label}</Text>
          </Pressable>
        );
      })}
      <Reanimated.View style={[styles.segmentUnderline, segUnderlineStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabRail: {
    flexDirection: 'row',
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    position: 'relative',
  },
  tab: {
    flex: 1,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  tabLabelActive: {
    fontFamily: Typography.family.bold,
    color: TEXT,
  },
  tabCount: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  tabCountActive: {
    color: SECONDARY,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: TEXT,
    borderRadius: 1,
  },
  segmentControl: {
    flexDirection: 'row',
    gap: Space.lg,
    position: 'relative',
  },
  segment: {
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  segmentLabelActive: {
    color: TEXT,
    fontFamily: Typography.family.semibold,
  },
  segmentUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: TEXT,
    borderRadius: 1,
  },
});
