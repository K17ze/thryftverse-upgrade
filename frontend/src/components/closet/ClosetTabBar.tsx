import React from 'react';
import { View, Text } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CLOSET_TABS } from '../../hooks/closet/constants';
import { closetTabLabel, type ClosetTabKey } from '../../domain/closet';
import { closetStyles, useClosetThemedStyles } from './closetStyles';

interface ClosetTabBarProps {
  activeTab: ClosetTabKey;
  /** Raw (unfiltered) item counts per tab for the a11y labels. */
  counts: Record<ClosetTabKey, number>;
  onTabChange: (tab: ClosetTabKey) => void;
}

/** Closet tab rail — text tabs with a hairline rule and underline indicator. */
export function ClosetTabBar({ activeTab, counts, onTabChange }: ClosetTabBarProps) {
  const t = useClosetThemedStyles();
  return (
    <View style={closetStyles.tabsWrap}>
      <View style={[closetStyles.tabBar, t.tabBar]}>
        {CLOSET_TABS.map((tab) => {
          const isActive = activeTab === tab;
          const tabLabel = closetTabLabel(tab);
          return (
            <AnimatedPressable
              key={tab}
              style={closetStyles.tabItem}
              onPress={() => onTabChange(tab)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tabLabel.toLowerCase()} tab, ${counts[tab]} items`}
            >
              <Text
                style={[
                  closetStyles.tabLabel,
                  t.tabLabel,
                  isActive && closetStyles.tabLabelActive,
                  isActive && t.tabLabelActive,
                ]}
                maxFontSizeMultiplier={2}
              >
                {tabLabel}
              </Text>
              {isActive && <View style={[closetStyles.tabIndicator, t.tabIndicator]} />}
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}
