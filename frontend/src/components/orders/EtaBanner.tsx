import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';

interface Props {
  etaWindow: string;
  estimatedDeliveryLabel: string | null;
  serviceName: string | null;
}

// Shown to buyers when the order is in transit with an ETA window.
// The ETA disappears when stale (past) so the buyer is never shown a false
// delivery promise. The stale tracking warning covers the overdue case.
export function EtaBanner({ etaWindow, estimatedDeliveryLabel, serviceName }: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    etaBanner: { backgroundColor: `${colors.brand}08`, borderColor: `${colors.brand}25` },
    etaIconWrap: {},
    etaLabel: { color: colors.textMuted },
    etaValue: { color: colors.textPrimary },
    etaService: { color: colors.textSecondary },
  }), [colors]);

  return (
    <View style={[styles.etaBanner, themed.etaBanner]}>
      <View style={[styles.etaIconWrap, themed.etaIconWrap]}>
        <Ionicons name="cube-outline" size={16} color={colors.brand} aria-hidden={true} />
      </View>
      <View style={styles.etaContent}>
        <Text style={[styles.etaLabel, themed.etaLabel]}>ESTIMATED DELIVERY</Text>
        <Text style={[styles.etaValue, themed.etaValue]}>
          {estimatedDeliveryLabel ? `By ${estimatedDeliveryLabel}` : etaWindow}
        </Text>
        {serviceName ? (
          <Text style={[styles.etaService, themed.etaService]}>{serviceName}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  etaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaContent: {
    flex: 1,
    gap: 2,
  },
  etaLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    opacity: 0.6,
  },
  etaValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  etaService: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    opacity: 0.5,
  },
});
