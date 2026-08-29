import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const TAB_HEIGHT = 44;
const TIMING_CONFIG = { duration: 220, easing: Easing.out(Easing.cubic) };

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
  const { colors } = useAppTheme();
  const reducedMotionHook = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
    if (reducedMotion || reducedMotionHook) {
      // Instant — no animation
      underlineTranslateX.value = targetX;
      underlineWidth.value = underlineW;
    } else {
      underlineTranslateX.value = withTiming(targetX, TIMING_CONFIG);
      underlineWidth.value = withTiming(underlineW, TIMING_CONFIG);
    }
  }, [measureTabs, reducedMotion, reducedMotionHook, underlineTranslateX, underlineWidth]);

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
    width: underlineWidth.value }));

  return (
    <View style={styles.tabRail}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
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
  const { colors } = useAppTheme();
  const reducedMotionHook = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
    if (reducedMotion || reducedMotionHook) {
      // Instant — no animation
      segUnderlineX.value = offsetX;
      segUnderlineW.value = segW;
    } else {
      segUnderlineX.value = withTiming(offsetX, TIMING_CONFIG);
      segUnderlineW.value = withTiming(segW, TIMING_CONFIG);
    }
  }, [measureSegments, reducedMotion, reducedMotionHook, segUnderlineX, segUnderlineW]);

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
    width: segUnderlineW.value }));

  return (
    <View style={styles.segmentControl}>
      {segments.map((seg) => {
        const isActive = seg.key === activeKey;
        return (
          <Pressable
            key={seg.key}
            style={({ pressed }) => [styles.segment, pressed && { opacity: 0.6 }]}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  tabRail: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    position: 'relative' },
  tab: {
    flex: 1,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center' },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs + 1 },
  tabLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary,
    letterSpacing: TypographyV2.body.letterSpacing },
  tabLabelActive: {
    fontFamily: Typography.family.bold,
    color: colors.textPrimary },
  tabCount: {
    fontSize: TypographyV2.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    minWidth: 14 },
  tabCountActive: {
    color: colors.textSecondary },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.sm },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    position: 'relative' },
  segment: {
    paddingVertical: 10,
    paddingHorizontal: Space.md },
  segmentLabel: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: -0.1 },
  segmentLabelActive: {
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary },
  segmentUnderline: {
    position: 'absolute',
    bottom: 0,
    height: Stroke.emphasis,
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.sm } });
}
