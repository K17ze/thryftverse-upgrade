import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';

interface OpenTicket {
  id: string;
  topicLabel: string;
}

interface Props {
  openTicket: OpenTicket | null | undefined;
  onPressOpenTicket: (ticketId: string) => void;
  onPressGetSupport: () => void;
}

export function OrderSupportSection({
  openTicket,
  onPressOpenTicket,
  onPressGetSupport }: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    supportLabel: { color: colors.textPrimary },
    supportSub: { color: colors.textMuted } }), [colors]);

  if (openTicket) {
    return (
      <View style={styles.supportSection}>
        <Pressable
          style={({ pressed }) => [styles.supportRow, pressed && styles.supportRowPressed]}
          onPress={() => { haptics.tap(); onPressOpenTicket(openTicket.id); }}
          accessibilityRole="button"
          accessibilityLabel={`Open support request: ${openTicket.topicLabel}`}
        >
          <Ionicons name="help-circle-outline" size={22} color={colors.brand} aria-hidden={true} />
          <View style={styles.supportInfo}>
            <Text style={[styles.supportLabel, themed.supportLabel]}>Support request open</Text>
            <Text style={[styles.supportSub, themed.supportSub]}>{openTicket.topicLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.supportSection}>
      <Pressable
        style={({ pressed }) => [styles.supportRow, pressed && styles.supportRowPressed]}
        onPress={() => { haptics.tap(); onPressGetSupport(); }}
        accessibilityRole="button"
        accessibilityLabel="Get support for this order"
      >
        <Ionicons name="help-circle-outline" size={22} color={colors.brand} aria-hidden={true} />
        <View style={styles.supportInfo}>
          <Text style={[styles.supportLabel, themed.supportLabel]}>Get support</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  supportSection: {
    paddingVertical: Space.sm },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: Control.hit },
  supportRowPressed: {
    opacity: 0.7 },
  supportInfo: {
    flex: 1 },
  supportLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  supportSub: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs / 2 } });
