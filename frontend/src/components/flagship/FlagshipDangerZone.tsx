import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppButton } from '../ui/AppButton';

import { Space, Radius, Type, Typography, Stroke} from '../../theme/designTokens';
export interface FlagshipDangerZoneProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  style?: ViewStyle;
  destructive?: boolean;
}

export function FlagshipDangerZone({
  title,
  description,
  actionLabel,
  onAction,
  style,
  destructive = true,
}: FlagshipDangerZoneProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.dangerSubtle,
          borderColor: colors.dangerBorder,
        },
        style,
      ]}
    >
      <Text style={[styles.title, { color: colors.danger }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      <AppButton
        title={actionLabel}
        variant={destructive ? 'danger' : 'secondary'}
        onPress={onAction}
        size="sm"
        hapticFeedback="heavy"
        titleStyle={destructive ? undefined : { color: colors.danger }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
    marginBottom: Space.xs,
  },
  description: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.md,
  },
});