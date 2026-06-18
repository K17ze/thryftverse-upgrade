import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Meta, Caption } from './ui/Text';

interface FinancialDisclosureProps {
  title?: string;
  items?: string[];
  style?: any;
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
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Ionicons name="warning-outline" size={20} color={Colors.textMuted} />
        <Meta style={styles.headerTitle}>{title}</Meta>
      </View>
      {items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <View style={styles.bullet} />
          <Caption color={Colors.textMuted} style={styles.itemText}>
            {item}
          </Caption>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  headerTitle: {
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
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
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    marginTop: 6,
  },
  itemText: {
    flex: 1,
    lineHeight: Type.caption.lineHeight + 2,
  },
});