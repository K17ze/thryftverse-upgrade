import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type } from '../../theme/designTokens';
import { Typography } from '../../theme/designTokens';

export interface FlagshipFormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  noCard?: boolean;
}

export function FlagshipFormSection({
  title,
  description,
  children,
  style,
  noCard = false,
}: FlagshipFormSectionProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.wrapper, style]}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      ) : null}
      {description ? (
        <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}
      {noCard ? (
        <View style={styles.noCard}>{children}</View>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Space.lg,
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
    lineHeight: Type.meta.lineHeight,
  },
  sectionDescription: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.sm + 4,
    marginLeft: Space.xs,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  noCard: {
    marginHorizontal: 0,
  },
});
