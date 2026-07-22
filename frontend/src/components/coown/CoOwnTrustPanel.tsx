import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

export interface CoOwnTrustPanelProps {
  authenticityStatus?: 'not_offered' | 'eligible' | 'verified' | null;
  buyerProtection?: boolean;
  storageInfo?: string | null;
  possessionInfo?: string | null;
}

export function CoOwnTrustPanel({
  authenticityStatus,
  buyerProtection,
  storageInfo,
  possessionInfo,
}: CoOwnTrustPanelProps) {
  const { colors } = useAppTheme();

  const items: Array<{ icon: string; label: string; value: string; positive: boolean }> = [];

  if (authenticityStatus === 'verified') {
    items.push({ icon: 'shield-checkmark', label: 'Authenticity', value: 'Verified', positive: true });
  } else if (authenticityStatus === 'eligible') {
    items.push({ icon: 'shield-outline', label: 'Authenticity', value: 'Eligible for verification', positive: true });
  } else if (authenticityStatus === 'not_offered') {
    items.push({ icon: 'shield-outline', label: 'Authenticity', value: 'Not offered', positive: false });
  }

  if (buyerProtection) {
    items.push({ icon: 'checkmark-circle', label: 'Buyer protection', value: 'Included', positive: true });
  }

  if (storageInfo) {
    items.push({ icon: 'cube-outline', label: 'Storage', value: storageInfo, positive: true });
  }

  if (possessionInfo) {
    items.push({ icon: 'hand-left-outline', label: 'Possession', value: possessionInfo, positive: true });
  }

  if (items.length === 0) return null;

  const a11yLabel = `Trust and protection. ${items.map((i) => `${i.label}: ${i.value}`).join('. ')}`;

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Trust & protection</Text>
      <View style={styles.itemsList}>
        {items.map((item, i) => (
          <View key={`${item.label}-${i}`} style={[styles.itemRow, { borderColor: colors.border }]}>
            <View style={[styles.itemIcon, { backgroundColor: item.positive ? colors.brand + '15' : colors.surfaceAlt }]}>
              <Ionicons name={item.icon as any} size={16} color={item.positive ? colors.brand : colors.textMuted} />
            </View>
            <View style={styles.itemBody}>
              <Text style={[styles.itemLabel, { color: colors.textMuted }]}>{item.label}</Text>
              <Text style={[styles.itemValue, { color: item.positive ? colors.textPrimary : colors.textSecondary }]}>
                {item.value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  itemsList: {
    gap: Space.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  itemValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
});
