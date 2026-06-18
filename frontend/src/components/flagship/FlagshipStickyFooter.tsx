import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { FlagshipActionCluster, ActionItem } from './FlagshipActionCluster';

export interface FlagshipStickyFooterProps {
  actions: ActionItem[];
  layout?: 'stack' | 'row' | 'row-reverse';
  style?: ViewStyle;
}

export function FlagshipStickyFooter({
  actions,
  layout = 'stack',
  style,
}: FlagshipStickyFooterProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, Space.md),
        },
        style,
      ]}
    >
      <FlagshipActionCluster actions={actions} layout={layout} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
});