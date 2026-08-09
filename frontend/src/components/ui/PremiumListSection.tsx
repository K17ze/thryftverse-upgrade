import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';

interface PremiumListSectionProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
}

export function PremiumListSection({
  title,
  subtitle,
  children,
  style,
  cardStyle,
}: PremiumListSectionProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.wrapper, style]}>
      {title ? (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      <View style={[styles.card, cardStyle]}>
        {children}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: {
    marginBottom: Space.lg,
    paddingHorizontal: Space.md,
  },
  header: {
    marginBottom: Space.smMd,
    gap: 2,
  },
  title: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    lineHeight: 17,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
