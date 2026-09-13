import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CLOSET_TAB_ICONS } from '../../hooks/closet/constants';
import type { ClosetTabKey } from '../../domain/closet';
import { closetStyles, useClosetThemedStyles } from './closetStyles';

interface ClosetHeaderActionsProps {
  activeTab: ClosetTabKey;
  count: number;
  onShare: () => void;
}

/** Header right-side cluster: share-closet button + active-tab count pill. */
export function ClosetHeaderActions({ activeTab, count, onShare }: ClosetHeaderActionsProps) {
  const { colors } = useAppTheme();
  const t = useClosetThemedStyles();
  return (
    <View style={closetStyles.headerRightActions}>
      <AnimatedPressable
        style={closetStyles.shareBtn}
        onPress={onShare}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Share closet"
      >
        <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
      </AnimatedPressable>
      <View style={[closetStyles.countPill, t.countPill]}>
        <Ionicons name={CLOSET_TAB_ICONS[activeTab]} size={12} color={colors.textMuted} />
        <Text style={[closetStyles.countBadge, t.countBadge]}>{count}</Text>
      </View>
    </View>
  );
}
