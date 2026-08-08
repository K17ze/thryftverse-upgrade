import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Type } from '../../theme/designTokens';

interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface PublicProfileTabRailProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function PublicProfileTabRail({ tabs, activeKey, onChange }: PublicProfileTabRailProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab${tab.count !== undefined ? `, ${tab.count} items` : ''}`}
          >
            <View style={styles.tabContent}>
              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              {tab.count !== undefined ? (
                <Text style={[styles.count, isActive && styles.countActive]}>
                  {tab.count}
                </Text>
              ) : null}
            </View>
            {isActive ? <View style={styles.underline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  labelActive: {
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  count: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  countActive: {
    color: colors.textSecondary,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    backgroundColor: colors.textPrimary,
  },
  });
}
