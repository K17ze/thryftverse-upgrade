import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, FontFamily, PressScale } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { haptics } from '../../../utils/haptics';

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

export function CoOwnSegmentNav({
  activeTab,
  onTabChange,
  hasActiveOrders,
  hasUnclaimedDistributions,
}: CoOwnSegmentNavProps) {
  const { colors, isDark } = useAppTheme();

  const handleSelect = (tab: CoOwnDetailTab) => {
    if (tab === activeTab) return;
    haptics.selection();
    onTabChange(tab);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderBottomColor: colors.borderSubtle }]}>
      <View style={[styles.segmentTrack, { backgroundColor: colors.surfaceAlt }]}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const showBadge = (tab.key === 'market' && hasActiveOrders) || (tab.key === 'ownership' && hasUnclaimedDistributions);

          return (
            <Pressable
              key={tab.key}
              onPress={() => handleSelect(tab.key)}
              style={({ pressed }) => [
                styles.tabButton,
                isActive && [
                  styles.activeTabButton,
                  { backgroundColor: colors.background, shadowColor: isDark ? '#000' : '#888' },
                ],
                pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} section`}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.textPrimary : colors.textSecondary,
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
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
    position: 'relative',
    gap: 4,
  },
  activeTabButton: {
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
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
});
