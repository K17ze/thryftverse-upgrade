import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Meta, Caption } from './ui/Text';

interface FinancialDisclosureProps {
  title?: string;
  items?: string[];
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_ITEMS = [
  'Co-own assets carry market risk. Prices can go up or down.',
  'Past performance does not guarantee future returns.',
  'Only invest what you can afford to lose.',
  'Platform fees apply to every transaction.',
];

export function FinancialDisclosure({
  title = 'Risk disclosure',
  items = DEFAULT_ITEMS,
  style,
}: FinancialDisclosureProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Ionicons name="warning-outline" size={20} color={colors.textMuted} />
        <Meta style={styles.headerTitle}>{title}</Meta>
      </View>
      {items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <View style={styles.bullet} />
          <Caption color={colors.textMuted} style={styles.itemText}>
            {item}
          </Caption>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      padding: Space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginBottom: Space.sm,
    },
    headerTitle: {
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    bullet: {
      width: 4,
      height: 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.textMuted,
      marginTop: 6,
    },
    itemText: {
      flex: 1,
      lineHeight: Type.caption.lineHeight + 2,
    },
  });
}
