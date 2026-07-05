import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;
const BRAND = Colors.brand;

const TAB_HEIGHT = 44;
const SPRING_CONFIG = { damping: 18, stiffness: 260, mass: 1 };

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
 * Normal motion: spring (damping 18, stiffness 260).
 * Reduced motion: instant assignment — no timing animation.
 */
export function TabRail({ tabs, activeKey, onChange, reducedMotion = false }: TabRailProps) {
  const tabWidths = useRef<Record<string, number>>({});
  const tabOffsets = useRef<Record<string, number>>({});
  const underlineTranslateX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  const measureTabs = useCallback(() => {
    let offsetX = 0;
    for (const tab of tabs) {
      tabOffsets.current[tab.key] = offsetX;
      offsetX += tabWidths.current[tab.key] ?? 0;
    }
  }, [tabs]);

  const positionUnderline = useCallback((key: string) => {
    measureTabs();
    const tabW = tabWidths.current[key] ?? 0;
    const offsetX = tabOffsets.current[key] ?? 0;
    const underlineW = tabW * 0.4;
    const targetX = offsetX + (tabW - underlineW) / 2;
    if (reducedMotion) {
      // Instant — no animation
      underlineTranslateX.value = targetX;
      underlineWidth.value = underlineW;
    } else {
      underlineTranslateX.value = withSpring(targetX, SPRING_CONFIG);
      underlineWidth.value = withSpring(underlineW, SPRING_CONFIG);
    }
  }, [measureTabs, reducedMotion, underlineTranslateX, underlineWidth]);

  const onTabLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    tabWidths.current[key] = e.nativeEvent.layout.width;
    if (key === activeKey) {
      positionUnderline(key);
    }
  }, [activeKey, positionUnderline]);

  const handlePress = useCallback((key: TabKey) => {
    positionUnderline(key);
    onChange(key);
  }, [positionUnderline, onChange]);

  // Initialize/update underline position on activeKey change
  React.useEffect(() => {
    positionUnderline(activeKey);
  }, [activeKey, positionUnderline]);

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
              {/* Fixed-width label container to prevent layout shift on weight change */}
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

interface SegmentedControlProps<K extends string = SegmentKey> {
  segments: { key: K; label: string }[];
  activeKey: K;
  onChange: (key: K) => void;
  reducedMotion?: boolean;
}

/**
 * Editorial text segment for For sale / Sold. Quieter equivalent to TabRail.
 * Uses a simple underline that moves between segments.
 * Reduced motion: instant assignment.
 */
export function SegmentedControl<K extends string = SegmentKey>({ segments, activeKey, onChange, reducedMotion = false }: SegmentedControlProps<K>) {
  const segWidths = useRef<Record<string, number>>({});
  const segOffsets = useRef<Record<string, number>>({});
  const segUnderlineX = useSharedValue(0);
  const segUnderlineW = useSharedValue(0);

  const measureSegments = useCallback(() => {
    let offsetX = 0;
    for (const seg of segments) {
      segOffsets.current[seg.key] = offsetX;
      offsetX += segWidths.current[seg.key] ?? 0;
    }
  }, [segments]);

  const positionSegUnderline = useCallback((key: string) => {
    measureSegments();
    const segW = segWidths.current[key] ?? 0;
    const offsetX = segOffsets.current[key] ?? 0;
    if (reducedMotion) {
      // Instant — no animation
      segUnderlineX.value = offsetX;
      segUnderlineW.value = segW;
    } else {
      segUnderlineX.value = withSpring(offsetX, SPRING_CONFIG);
      segUnderlineW.value = withSpring(segW, SPRING_CONFIG);
    }
  }, [measureSegments, reducedMotion, segUnderlineX, segUnderlineW]);

  const onSegLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    segWidths.current[key] = e.nativeEvent.layout.width;
    if (key === activeKey) {
      positionSegUnderline(key);
    }
  }, [activeKey, positionSegUnderline]);

  const handleSegPress = useCallback((key: K) => {
    positionSegUnderline(key);
    onChange(key);
  }, [positionSegUnderline, onChange]);

  React.useEffect(() => {
    positionSegUnderline(activeKey);
  }, [activeKey, positionSegUnderline]);

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
    alignItems: 'baseline',
    gap: 5,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: SECONDARY,
    letterSpacing: -0.2,
  },
  tabLabelActive: {
    fontFamily: Typography.family.bold,
    color: TEXT,
  },
  tabCount: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: MUTED,
    minWidth: 14,
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
    backgroundColor: BG,
    position: 'relative',
  },
  segment: {
    paddingVertical: 10,
    paddingHorizontal: Space.md,
  },
  segmentLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
    letterSpacing: -0.1,
  },
  segmentLabelActive: {
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  segmentUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: TEXT,
    borderRadius: 1,
  },
});
