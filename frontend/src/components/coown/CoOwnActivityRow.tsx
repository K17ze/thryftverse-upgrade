import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

export type CoOwnActivityStatus = 'pending' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'expired';
export type CoOwnActivitySide = 'buy' | 'sell';
/** Doc 10 §3.3: settlement finality states. */
export type CoOwnSettlementState = 'executed' | 'settling' | 'settled' | 'reversed' | 'failed';

export interface CoOwnActivityRowProps {
  imageUri?: string | null;
  title: string;
  side: CoOwnActivitySide;
  units: number;
  unitPriceLabel: string;
  amountLabel: string;
  status: CoOwnActivityStatus;
  timestamp: string;
  onPress?: () => void;
  index?: number;
  // Phase 6: execution reference (order id, execution id, corporate-action id)
  executionRef?: string;
  /** Whether this row is on a public surface (hides user identity). */
  isPublic?: boolean;
  /** Filled units (for partially_filled status). */
  filledUnits?: number;
  /** Doc 10 §3.3: settlement finality state. */
  settlementState?: CoOwnSettlementState;
  /** Settlement ETA label (e.g. "ETA 2h"). */
  settlementEtaLabel?: string;
  /** WS3: Reason the settlement failed. Shown when settlementState is 'failed' or 'reversed'. */
  failureReason?: string | null;
  /** WS3: User-facing recovery action for a failed/reversed settlement. */
  recoveryAction?: string | null;
}

const STATUS_LABELS: Record<CoOwnActivityStatus, { label: string; color: 'success' | 'textSecondary' | 'danger' }> = {
  pending: { label: 'Pending', color: 'textSecondary' },
  open: { label: 'Open', color: 'success' },
  partially_filled: { label: 'Partial', color: 'success' },
  filled: { label: 'Filled', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'textSecondary' },
  rejected: { label: 'Rejected', color: 'danger' },
  expired: { label: 'Expired', color: 'textSecondary' },
};

const SETTLEMENT_LABELS: Record<CoOwnSettlementState, { label: string; icon: string }> = {
  executed: { label: 'Executed · settling', icon: 'sync-outline' },
  settling: { label: 'Settling', icon: 'hourglass-outline' },
  settled: { label: 'Settled', icon: 'checkmark-circle-outline' },
  reversed: { label: 'Reversed', icon: 'swap-horizontal-outline' },
  failed: { label: 'Settlement failed · reversed', icon: 'alert-circle-outline' },
};

export function CoOwnActivityRow({
  imageUri,
  title,
  side,
  units,
  unitPriceLabel,
  amountLabel,
  status,
  timestamp,
  onPress,
  index = 0,
  executionRef,
  isPublic,
  filledUnits,
  settlementState,
  settlementEtaLabel,
  failureReason,
  recoveryAction,
}: CoOwnActivityRowProps) {
  const { colors } = useAppTheme();
  const statusCfg = STATUS_LABELS[status];
  const statusColor = statusCfg.color === 'success' ? colors.success : statusCfg.color === 'danger' ? colors.danger : colors.textSecondary;
  const isBuy = side === 'buy';

  // Phase 6: status transition indicator
  const showFilledInfo = status === 'partially_filled' && filledUnits != null;

  // Doc 10 §3.3: settlement finality badge
  const settlementCfg = settlementState ? SETTLEMENT_LABELS[settlementState] : null;
  const settlementColor = settlementState === 'settled'
    ? colors.success
    : settlementState === 'failed' || settlementState === 'reversed'
      ? colors.danger
      : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.root, { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${isBuy ? 'bought' : 'sold'} ${units} units${showFilledInfo ? `, ${filledUnits} filled` : ''}, ${amountLabel}, ${statusCfg.label}${executionRef ? `, reference ${executionRef}` : ''}, ${timestamp}`}
    >
      <View style={styles.imageWrap}>
        {imageUri ? (
          <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.amount, { color: colors.textPrimary }]}>{amountLabel}</Text>
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.sidePill, { backgroundColor: isBuy ? colors.coownUp + '18' : colors.coownDown + '18' }]}>
            <Text style={[styles.sideText, { color: isBuy ? colors.coownUp : colors.coownDown }]}>
              {isBuy ? 'BUY' : 'SELL'}
            </Text>
          </View>
          <Text style={[styles.unitsText, { color: colors.textSecondary }]}>
            {units} units × {unitPriceLabel}
          </Text>
          {/* Phase 6: filled units for partial fills */}
          {showFilledInfo && (
            <Text style={[styles.filledText, { color: colors.coownUp }]}>
              ({filledUnits} filled)
            </Text>
          )}
        </View>
        <View style={styles.footerRow}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusCfg.label}</Text>
          </View>
          {/* Doc 10 §3.3: settlement finality badge */}
          {settlementCfg && (
            <View style={[styles.settlementPill, { backgroundColor: settlementColor + '12' }]}>
              <Ionicons name={settlementCfg.icon as any} size={10} color={settlementColor} />
              <Text style={[styles.settlementText, { color: settlementColor }]} numberOfLines={1}>
                {settlementCfg.label}{settlementEtaLabel ? ` · ${settlementEtaLabel}` : ''}
              </Text>
            </View>
          )}
          {/* Phase 6: execution reference — immutable, no user identity on public rows */}
          {executionRef && (
            <Text style={[styles.refText, { color: colors.textMuted }]} numberOfLines={1}>
              ref {executionRef}
            </Text>
          )}
          <Text style={[styles.timestamp, { color: colors.textMuted }]}>{timestamp}</Text>
        </View>
        {/* WS3: Settlement failure reason + recovery action.
            Equity-market pattern: failed trades must disclose the cause
            and the user's recovery path — not just a badge. */}
        {(settlementState === 'failed' || settlementState === 'reversed') && failureReason && (
          <View style={[styles.failureRow, { backgroundColor: colors.danger + '08' }]}>
            <Ionicons name="alert-circle-outline" size={12} color={colors.danger} />
            <Text style={[styles.failureText, { color: colors.danger }]} numberOfLines={2}>
              {failureReason}{recoveryAction ? ` · ${recoveryAction}` : ''}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  imageWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: 52,
    height: 52,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
  },
  title: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  amount: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  sidePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  sideText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.4,
  },
  unitsText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
  timestamp: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  // Phase 6: filled + ref
  filledText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  refText: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // Doc 10 §3.3: settlement pill
  settlementPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  settlementText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
  // WS3: failure/recovery disclosure
  failureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
  },
  failureText: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    lineHeight: Type.meta.size * 1.3,
  },
});
