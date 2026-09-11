import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppStatusPill } from '../ui/AppStatusPill';
import { Meta, BodyEmphasis, Body } from '../ui/Text';
import { formatShortDateTime, formatFullDateTime } from '../../utils/dateFormat';

export type OrderSide = 'buy' | 'sell';
// Use the canonical OrderStatus from coOwnModels (12-state machine per spec 10 §2.1-2.2)
export type OrderStatus = import('../../data/coOwnModels').OrderStatus;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  open: 'Open',
  partial: 'Partial',
  filled: 'Filled',
  cancel_pending: 'Cancelling',
  cancelled: 'Cancelled',
  replace_pending: 'Replacing',
  halted_open: 'Halted',
  expired: 'Expired',
  rejected: 'Rejected',
  // Legacy compat — map old status to display label
  partially_filled: 'Partial',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}


interface OrderHistoryRowProps {
  id: string;
  side: OrderSide;
  type: 'market' | 'limit' | 'protected';
  assetTitle: string;
  quantity: number;
  filledQuantity?: number;
  pricePerShare: string;
  totalAmount: string;
  fee?: string;
  status: OrderStatus;
  timestamp: string;
  onPress?: () => void;
  onCancel?: () => void;
  isCancelling?: boolean;
  /** True when the cancel request was definitively rejected by the server.
   *  The row stays visible and the cancel control shows "Cancel failed — retry". */
  cancelFailed?: boolean;
  issuerHandle?: string;
  issuerAvatar?: string;
  canMessageIssuer?: boolean;
  onPressIssuer?: () => void;
  onMessageIssuer?: () => void;
  // U36: multi-fill receipt detail. When `showReceipt` is true an expandable
  // "Receipt" affordance is rendered below the price row, revealing the
  // executed/remaining quantities, average execution price, fees, timestamps
  // and terminal reason. Fields the backend does not provide are labelled
  // "Not available" rather than fabricated.
  showReceipt?: boolean;
  remainingQuantity?: number;
  averageExecutionPrice?: string | null;
  updatedAt?: string | null;
  terminalReason?: string | null;
}

function resolveSideIcon(side: OrderSide): keyof typeof Ionicons.glyphMap {
  return side === 'buy' ? 'wallet-outline' : 'cash-outline';
}

function resolveSideColor(side: OrderSide, colors: ThemeColors): string {
  return side === 'buy' ? colors.brand : colors.textSecondary;
}

function resolveStatusTone(status: string) {
  switch (status) {
    case 'filled':
      return 'positive' as const;
    case 'open':
    case 'accepted':
    case 'submitted':
      return 'warning' as const;
    case 'partially_filled':
    case 'replace_pending':
      return 'accent' as const;
    case 'cancel_pending':
    case 'halted_open':
      return 'warning' as const;
    case 'cancelled':
    case 'expired':
    case 'draft':
      return 'neutral' as const;
    case 'rejected':
      return 'negative' as const;
    default:
      return 'neutral' as const;
  }
}

export function OrderHistoryRow({
  side,
  type,
  assetTitle,
  quantity,
  filledQuantity,
  pricePerShare,
  totalAmount,
  fee,
  status,
  timestamp,
  onPress,
  onCancel,
  isCancelling = false,
  cancelFailed = false,
  issuerHandle,
  issuerAvatar,
  canMessageIssuer = false,
  onPressIssuer,
  onMessageIssuer,
  showReceipt = false,
  remainingQuantity,
  averageExecutionPrice = null,
  updatedAt = null,
  terminalReason = null,
}: OrderHistoryRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [isReceiptOpen, setIsReceiptOpen] = React.useState(false);

  const executed = filledQuantity ?? 0;
  const remaining = remainingQuantity ?? Math.max(0, quantity - executed);
  const NOT_AVAILABLE = 'Not available';

  return (
    <AnimatedPressable
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.92}
      disableAnimation={false}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${side} ${quantity} units of ${assetTitle}`}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={resolveSideIcon(side)}
          size={20}
          color={resolveSideColor(side, colors)}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <BodyEmphasis style={styles.title} numberOfLines={1}>
            {assetTitle}
          </BodyEmphasis>
          <AppStatusPill tone={resolveStatusTone(status)} label={statusLabel(status)} size="sm" />
        </View>

        <View style={styles.metaRow}>
          <Meta style={styles.metaLabel} numberOfLines={1}>
            {side.toUpperCase()}  {type}  {status === 'partially_filled' && filledQuantity != null
              ? `${filledQuantity} of ${quantity} filled`
              : `${quantity} units`}
          </Meta>
          <Meta style={styles.timestamp} numberOfLines={1}>{formatShortDateTime(timestamp)}</Meta>
        </View>

        <View style={styles.priceRow}>
          <Body style={styles.price} numberOfLines={1}>{pricePerShare} / share</Body>
          <BodyEmphasis style={styles.total} numberOfLines={1}>{totalAmount}</BodyEmphasis>
        </View>

        {/* U36: expandable multi-fill receipt. Explains one order across
            fills — executed/remaining quantity, average execution, fees,
            timestamps, terminal reason, and a route back to the exact asset. */}
        {showReceipt ? (
          <View style={styles.receiptWrap}>
            <Pressable
              style={styles.receiptToggle}
              onPress={() => setIsReceiptOpen((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={isReceiptOpen ? 'Hide receipt details' : 'Show receipt details'}
              accessibilityState={{ expanded: isReceiptOpen }}
            >
              <Meta style={styles.receiptToggleLabel}>Receipt</Meta>
              <Ionicons
                name={isReceiptOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color={colors.textMuted}
              />
            </Pressable>

            {isReceiptOpen ? (
              <View style={styles.receiptDetail}>
                <View style={styles.receiptRow}>
                  <Meta style={styles.receiptLabel}>Executed</Meta>
                  <Meta style={styles.receiptValue}>{executed} units</Meta>
                </View>
                <View style={styles.receiptRow}>
                  <Meta style={styles.receiptLabel}>Remaining</Meta>
                  <Meta style={styles.receiptValue}>{remaining} units</Meta>
                </View>
                <View style={styles.receiptRow}>
                  <Meta style={styles.receiptLabel}>Avg execution</Meta>
                  <Meta style={styles.receiptValue}>
                    {averageExecutionPrice ?? NOT_AVAILABLE}
                  </Meta>
                </View>
                <View style={styles.receiptRow}>
                  <Meta style={styles.receiptLabel}>Fees</Meta>
                  <Meta style={styles.receiptValue}>{fee ?? NOT_AVAILABLE}</Meta>
                </View>
                <View style={styles.receiptRow}>
                  <Meta style={styles.receiptLabel}>Created</Meta>
                  <Meta style={[styles.receiptValue, styles.receiptMono]}>
                    {formatFullDateTime(timestamp)}
                  </Meta>
                </View>
                <View style={styles.receiptRow}>
                  <Meta style={styles.receiptLabel}>Updated</Meta>
                  <Meta style={[styles.receiptValue, styles.receiptMono]}>
                    {updatedAt ? formatFullDateTime(updatedAt) : NOT_AVAILABLE}
                  </Meta>
                </View>
                <View style={styles.receiptRow}>
                  <Meta style={styles.receiptLabel}>Reason</Meta>
                  <Meta style={styles.receiptValue}>{terminalReason ?? NOT_AVAILABLE}</Meta>
                </View>
                <Pressable
                  style={styles.receiptAssetLink}
                  onPress={onPress}
                  accessibilityRole="link"
                  accessibilityLabel={`View asset ${assetTitle}`}
                >
                  <Meta style={styles.receiptAssetLinkText}>View asset</Meta>
                  <Ionicons name="chevron-forward" size={12} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {onCancel ? (
          <AnimatedPressable
            onPress={onCancel}
            style={styles.cancelAction}
            scaleValue={0.97}
            accessibilityRole="button"
            accessibilityLabel={
              cancelFailed
                ? `Retry cancel ${side} order for ${assetTitle}`
                : `Cancel ${side} order for ${assetTitle}`
            }
          >
            <Ionicons
              name={cancelFailed ? 'alert-circle-outline' : 'close-circle-outline'}
              size={15}
              color={cancelFailed ? colors.danger : colors.textSecondary}
            />
            <Meta style={[styles.cancelText, cancelFailed && { color: colors.danger }]}>
              {cancelFailed
                ? 'Cancel failed — retry'
                : isCancelling
                  ? 'Cancelling…'
                  : 'Cancel remaining'}
            </Meta>
          </AnimatedPressable>
        ) : null}

        {issuerHandle && onPressIssuer && (
          <View style={styles.issuerRow}>
            <AnimatedPressable
              style={styles.issuerChip}
              onPress={onPressIssuer}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Open @${issuerHandle} profile`}
              accessibilityHint="Shows issuer profile details"
            >
              {issuerAvatar ? (
                <CachedImage uri={issuerAvatar} style={styles.issuerAvatar} containerStyle={styles.issuerAvatarWrap} contentFit="cover" />
              ) : (
                <View style={styles.issuerAvatarPlaceholder}>
                  <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                </View>
              )}
              <Meta style={styles.issuerText} numberOfLines={1}>@{issuerHandle}</Meta>
            </AnimatedPressable>
            {onMessageIssuer && (
              <AnimatedPressable
                style={[styles.messageBtn, !canMessageIssuer && styles.messageBtnDisabled]}
                onPress={onMessageIssuer}
                disabled={!canMessageIssuer}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={canMessageIssuer ? `Message @${issuerHandle}` : 'Issuer is you'}
                accessibilityHint={canMessageIssuer ? 'Opens chat with issuer' : 'Messaging yourself is disabled'}
              >
                <Ionicons name={canMessageIssuer ? 'chatbubble-ellipses-outline' : 'checkmark'} size={12} color={colors.textPrimary} />
              </AnimatedPressable>
            )}
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconWrap: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space.xs,
    marginTop: Space.xxs,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xxs,
    gap: Space.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    marginRight: Space.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
    gap: Space.sm,
  },
  metaLabel: {
    flexShrink: 1,
    minWidth: 0,
  },
  timestamp: {
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
  },
  price: {
    color: colors.textSecondary,
    flexShrink: 1,
    minWidth: 0,
  },
  total: {
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  cancelAction: {
    alignSelf: 'flex-start',
    minHeight: Control.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    marginTop: Space.xs,
    paddingRight: Space.sm,
  },
  cancelText: {
    color: colors.textSecondary,
  },
  issuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  issuerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  issuerAvatarWrap: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  issuerAvatar: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
  },
  issuerAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  issuerText: {
    color: colors.textSecondary,
  },
  messageBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBtnDisabled: {
    opacity: 0.5,
  },
  // U36: expandable receipt
  receiptWrap: {
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  receiptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
  },
  receiptToggleLabel: {
    color: colors.textSecondary,
  },
  receiptDetail: {
    marginTop: Space.xs,
    gap: Space.xs,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.md,
  },
  receiptLabel: {
    color: colors.textMuted,
    flexShrink: 0,
  },
  receiptValue: {
    textAlign: 'right',
    flex: 1,
  },
  receiptMono: {
    fontVariant: ['tabular-nums'],
  },
  receiptAssetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: Control.hit,
    marginTop: Space.xs,
  },
  receiptAssetLinkText: {
    color: colors.textSecondary,
  },
});
