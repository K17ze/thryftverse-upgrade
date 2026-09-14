import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { OrderAuthentication } from '../../services/commerceApi';
import {
  orderAuthenticationPresentation,
  type AuthenticationTone } from './orderAuthenticationPresentation';

interface Props {
  /** Live pipeline state from GET /orders/:orderId/authentication. Null when
   *  the fetch hasn't resolved or failed — the durable flag still renders the
   *  honest "requested" state. */
  authentication: OrderAuthentication | null;
  /** orders.verification_requested on the order record — the durable signal. */
  verificationRequested: boolean;
}

/**
 * Order-level item verification status. Flat row on the canvas (hairline
 * separators are owned by the screen), one icon, label + single detail line.
 * No fabricated review timeline — the backend exposes no SLA.
 */
function OrderAuthenticationSectionBase({
  authentication,
  verificationRequested }: Props) {
  const { colors } = useAppTheme();

  const presentation = orderAuthenticationPresentation(
    authentication,
    verificationRequested
  );

  const themed = useMemo(() => {
    const toneColor: Record<AuthenticationTone, string> = {
      muted: colors.textMuted,
      info: colors.brand,
      success: colors.success,
      danger: colors.danger };
    return {
      label: { color: colors.textPrimary },
      detail: { color: colors.textMuted },
      iconColor: presentation ? toneColor[presentation.tone] : colors.textMuted };
  }, [colors, presentation]);

  if (!presentation) return null;

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Ionicons
          name={presentation.icon}
          size={22}
          color={themed.iconColor}
          aria-hidden={true}
        />
        <View style={styles.info}>
          <Text style={[styles.label, themed.label]} maxFontSizeMultiplier={2}>
            {presentation.label}
          </Text>
          <Text style={[styles.detail, themed.detail]} maxFontSizeMultiplier={2}>
            {presentation.detail}
          </Text>
        </View>
      </View>
    </View>
  );
}

const OrderAuthenticationSection = React.memo(OrderAuthenticationSectionBase);
OrderAuthenticationSection.displayName = 'OrderAuthenticationSection';
export { OrderAuthenticationSection };

const styles = StyleSheet.create({
  section: {
    paddingVertical: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: Control.hit },
  info: {
    flex: 1 },
  label: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  detail: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs / 2 } });
