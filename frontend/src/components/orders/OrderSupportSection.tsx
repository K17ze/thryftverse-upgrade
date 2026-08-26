import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Type, Control } from '../../theme/designTokens';
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
  onPressGetSupport,
}: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    supportLabel: { color: colors.textPrimary },
    supportSub: { color: colors.textMuted },
  }), [colors]);

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
    paddingVertical: Space.sm,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  supportRowPressed: {
    opacity: 0.7,
  },
  supportInfo: {
    flex: 1,
  },
  supportLabel: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  supportSub: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    marginTop: Space.xs / 2,
  },
});
