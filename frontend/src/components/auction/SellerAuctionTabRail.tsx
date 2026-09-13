import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { type SellerTab } from './sellerAuctionCentreViewModels';
import { Space, Typography, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface SellerAuctionTab {
  key: SellerTab;
  label: string;
  count: number;
}

// Tab rail — the single authoritative tab selector. In the flattened
// FlashList architecture it renders above the list (a 'header' item type is
// reserved in the flat model); the original SectionList kept it sticky via
// the section header.
export function SellerAuctionTabRail({
  tabs,
  activeTab,
  onTabPress,
  tabScrollRef,
  tabLayoutsRef }: {
  tabs: SellerAuctionTab[];
  activeTab: SellerTab;
  onTabPress: (key: SellerTab) => void;
  tabScrollRef: React.RefObject<ScrollView | null>;
  tabLayoutsRef: React.RefObject<Record<string, { x: number; width: number }>>;
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.tabBarContainer}>
      <ScrollView
        ref={tabScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <AnimatedPressable
              key={tab.key}
              style={styles.tab}
              onPress={() => onTabPress(tab.key)}
              onLayout={(e) => {
                tabLayoutsRef.current[tab.key] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width };
              }}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                  {tab.count}
                </Text>
              )}
              {isActive && <View style={styles.tabIndicator} />}
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // ── Tab bar — text-first, underline indicator, sticky container ──
  tabBarContainer: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    gap: Space.md,
    height: Control.hit,
    alignItems: 'center' },
  tab: {
    height: Control.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    paddingHorizontal: Space.xs / 2,
    position: 'relative' },
  tabPressed: {
    opacity: 0.5 },
  tabText: {
    fontSize: TypographyV2.body.size,
    color: colors.textSecondary,
    fontFamily: TypographyV2.body.fontFamily },
  tabTextActive: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold },
  tabCount: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  tabCountActive: {
    color: colors.textSecondary },
  tabIndicator: {
    position: 'absolute',
    bottom: -Stroke.hairline,
    left: Space.xs / 2,
    right: Space.xs / 2,
    height: Stroke.emphasis,
    backgroundColor: colors.textPrimary,
    borderRadius: Stroke.hairline } });
}
