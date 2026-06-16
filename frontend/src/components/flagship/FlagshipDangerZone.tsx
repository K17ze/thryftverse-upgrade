import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type } from '../../theme/designTokens';
import { Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

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
          backgroundColor: `${colors.danger}10`,
          borderColor: `${colors.danger}30`,
        },
        style,
      ]}
    >
      <Text style={[styles.title, { color: colors.danger }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      <AnimatedPressable
        onPress={onAction}
        scaleValue={0.97}
        hapticFeedback="heavy"
        style={[
          styles.actionBtn,
          {
            backgroundColor: destructive ? colors.danger : colors.surfaceAlt,
            borderColor: destructive ? colors.danger : colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.actionText,
            { color: destructive ? '#FFFFFF' : colors.danger },
          ]}
        >
          {actionLabel}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: 1,
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
  actionBtn: {
    borderRadius: Radius.xl,
    paddingVertical: Space.sm + 4,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
});