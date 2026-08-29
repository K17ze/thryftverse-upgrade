import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import type { CommerceOrder } from '../../services/commerceApi';

interface Props {
  order: CommerceOrder;
  normalisedStatus: string;
}

// Shown to buyers when funds are held in escrow (paid → delivered, not completed).
// The escrow release timing is server-derived via moneyProjection.estimatedReleaseAt;
// the client does not invent a fallback countdown.
export function EscrowBanner({ order, normalisedStatus }: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    escrowBanner: { backgroundColor: colors.successSubtle, borderColor: colors.successBorder },
    escrowTitle: { color: colors.textPrimary },
    escrowSub: { color: colors.textSecondary },
    escrowCountdown: { color: colors.textMuted },
  }), [colors]);

  return (
    <View style={[styles.escrowBanner, themed.escrowBanner]}>
      <Ionicons name="lock-closed" size={16} color={colors.success} aria-hidden={true} />
      <View style={styles.escrowTextWrap}>
        <Text style={[styles.escrowTitle, themed.escrowTitle]}>Funds held in escrow</Text>
        <Text style={[styles.escrowSub, themed.escrowSub]}>
          {normalisedStatus === 'paid'
            ? 'Payment confirmed. Funds are held until the seller dispatches.'
            : 'Funds are held. Confirm receipt to release funds to the seller.'}
        </Text>
        {(() => {
          const releaseAt = (order as any)?.moneyProjection?.estimatedReleaseAt;
          if (!releaseAt) return null;
          const releaseTime = new Date(releaseAt).getTime();
          if (Number.isNaN(releaseTime)) return null;
          const now = Date.now();
          if (now >= releaseTime) return null;
          const daysLeft = Math.ceil((releaseTime - now) / (24 * 60 * 60 * 1000));
          return (
            <Text style={[styles.escrowCountdown, themed.escrowCountdown]}>
              Auto-releases to seller in {daysLeft} day{daysLeft === 1 ? '' : 's'} if not confirmed
            </Text>
          );
        })()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  escrowTextWrap: {
    flex: 1,
    gap: Space.xs / 2,
  },
  escrowTitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  escrowSub: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  escrowCountdown: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
    marginTop: Space.xs / 2,
    fontVariant: ['tabular-nums'],
  },
});
