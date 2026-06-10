import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

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
  return (
    <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <AnimatedPressable
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onChange(tab.key)}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab${tab.count !== undefined ? `, ${tab.count} items` : ''}`}
            >
              {tab.icon && (
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={isActive ? Colors.textPrimary : Colors.textMuted}
                />
              )}
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
              {tab.count !== undefined && (
                <View style={[styles.countPill, isActive && styles.countPillActive]}>
                  <Text style={[styles.countText, isActive && styles.countTextActive]}>{tab.count}</Text>
                </View>
              )}
              {isActive && <View style={styles.indicator} />}
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scroll: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
  },
  tabActive: {
    backgroundColor: Colors.surface,
  },
  label: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: Colors.textMuted,
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
    bottom: -Space.sm - 1,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: Colors.textPrimary,
    borderRadius: 1,
  },
});
