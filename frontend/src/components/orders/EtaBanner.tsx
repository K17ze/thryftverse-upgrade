import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

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
    etaBanner: { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
    etaIconWrap: {},
    etaLabel: { color: colors.textMuted },
    etaValue: { color: colors.textPrimary },
    etaService: { color: colors.textSecondary } }), [colors]);

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
    borderWidth: StyleSheet.hairlineWidth },
  etaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  etaContent: {
    flex: 1,
    gap: 2 },
  etaLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    opacity: 0.6 },
  etaValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  etaService: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    opacity: 0.5 } });
