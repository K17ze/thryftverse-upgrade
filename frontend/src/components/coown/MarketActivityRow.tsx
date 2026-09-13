import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { formatShortDateTime } from '../../utils/dateFormat';

export function MarketActivityRow({ title, detail, amount, status, timestamp, onPress }: {
  title: string; detail?: string; amount: string; status: string; timestamp: string; onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}, ${status}, ${formatShortDateTime(timestamp)}`}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.borderSubtle, opacity: pressed ? 0.65 : 1 }]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        {detail ? <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>{detail}</Text> : null}
        <Text style={[styles.meta, { color: colors.textMuted }]}>{formatShortDateTime(timestamp)}</Text>
      </View>
      <View style={styles.value}>
        <Text style={[styles.title, styles.number, { color: colors.textPrimary }]}>{amount}</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>{status}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Space.md, paddingHorizontal: Space.md, gap: Space.sm, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 88 },
  copy: { flex: 1, gap: Space.xxs },
  value: { flexShrink: 1, alignItems: 'flex-end', gap: Space.xxs, maxWidth: '45%' },
  title: { fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight, fontFamily: FontFamily.semibold },
  meta: { fontSize: TypographyV2.meta.size, lineHeight: TypographyV2.meta.lineHeight, fontFamily: FontFamily.regular },
  number: { fontVariant: ['tabular-nums'], textAlign: 'right' },
});
