/**
 * MediaTabBar — Recents | Albums | Photos | Videos tab row with the
 * spring-animated selection indicator.
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 * The indicator shared values and per-tab layout ref are owned by the
 * sheet (which drives the indicator from its tab-switch handler); this
 * component only renders the row and records each tab's layout.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  type SharedValue } from 'react-native-reanimated';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { MEDIA_TABS, type MediaTab, type TabLayoutMap } from './mediaBrowserTypes';
import type { MediaBrowserStyles } from './mediaBrowserStyles';

interface MediaTabBarProps {
  activeTab: MediaTab;
  allowVideos: boolean;
  onTabPress: (tab: MediaTab) => void;
  tabIndicatorXSV: SharedValue<number>;
  tabIndicatorWidthSV: SharedValue<number>;
  tabLayoutsRef: { current: TabLayoutMap };
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function MediaTabBar({
  activeTab,
  allowVideos,
  onTabPress,
  tabIndicatorXSV,
  tabIndicatorWidthSV,
  tabLayoutsRef,
  colors,
  styles }: MediaTabBarProps) {
  // ── Tab indicator animated style ──
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorXSV.value }],
    width: tabIndicatorWidthSV.value }));

  return (
    <View style={styles.tabRow}>
      <Reanimated.View
        style={[styles.tabIndicator, { backgroundColor: colors.brand }, tabIndicatorStyle]}
      />
      {MEDIA_TABS.map((tab) => {
        const active = activeTab === tab.key;
        // Hide the Videos tab when videos are not allowed
        if (tab.key === 'videos' && !allowVideos) return null;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            onLayout={(e) => {
              tabLayoutsRef.current[tab.key] = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width };
              if (tab.key === 'recents' && tabIndicatorWidthSV.value === 0) {
                tabIndicatorWidthSV.value = e.nativeEvent.layout.width;
              }
            }}
            style={styles.tab}
            accessibilityLabel={`Tab ${tab.label}`}
            accessibilityHint="Shows this media tab"
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: active ? colors.textPrimary : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
