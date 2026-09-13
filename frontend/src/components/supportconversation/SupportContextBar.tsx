import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  formatContextId,
  type SupportContextBarModel } from './supportConversationViewModels';

export interface SupportContextBarProps {
  context: SupportContextBarModel;
}

// Context bar — flat row, no card
export function SupportContextBar({ context }: SupportContextBarProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.contextBar}>
      <Ionicons
        name={context.icon as React.ComponentProps<typeof Ionicons>['name']}
        size={16}
        color={colors.textSecondary}
      />
      <Text style={styles.contextText} numberOfLines={1}>
        {context.label}
        {context.contextId && ` ${formatContextId(context.contextId)}`}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    contextBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    contextText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}
