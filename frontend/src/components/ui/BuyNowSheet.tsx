import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { AppButton } from './AppButton';
import { CachedImage } from '../CachedImage';
import { Meta, Headline } from './Text';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import {
  isBuyNowValid,
  mapApiErrorToTransactionError,
  shouldCloseSheetDueToLifecycle,
  isSheetStateStale,
  type TransactionError,
} from '../../utils/transactionSheetLogic';
import { parseApiError } from '../../lib/apiClient';
import { createStableId } from '../../utils/createStableId';
import { toIze, formatAuctionIze } from '../../utils/currency';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import type { AuctionDetailResponse, BuyNowResult } from '../../services/marketApi';

export interface BuyNowSheetAuctionContext {
  id: string;
  title: string;
  imageUrl: string | null;
  buyNowPriceGbp: number | null;
  sellerName: string;
  effectiveState: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled';
  isSeller: boolean;
}

interface BuyNowSheetProps {
  visible: boolean;
  onDismiss: () => void;
  auction: BuyNowSheetAuctionContext;
  currencyCode: SupportedCurrencyCode;
  formatFromFiat: (amount: number, currency?: SupportedCurrencyCode, opts?: any) => string;
  onSubmitBuyNow: (gbpAmount: number, idempotencyKey: string) => Promise<BuyNowResult>;
  onRefreshDetail: () => Promise<AuctionDetailResponse | null>;
}

type BuyNowStage = 'review' | 'submitting' | 'success' | 'error';

export function BuyNowSheet({
  visible,
  onDismiss,
  auction,
  currencyCode,
  formatFromFiat,
  onSubmitBuyNow,
  onRefreshDetail,
}: BuyNowSheetProps) {
  const [stage, setStage] = React.useState<BuyNowStage>('review');
  const [error, setError] = React.useState<TransactionError | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isPreflighting, setIsPreflighting] = React.useState(false);
  const [sheetOpenedAtMs, setSheetOpenedAtMs] = React.useState(0);
  const [authoritativePrice, setAuthoritativePrice] = React.useState<number | null>(null);
  const idempotencyKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setStage('review');
      setError(null);
      setIsSubmitting(false);
      setIsPreflighting(false);
      setSheetOpenedAtMs(Date.now());
      setAuthoritativePrice(auction.buyNowPriceGbp);
      idempotencyKeyRef.current = null;
    }
  }, [visible, auction.buyNowPriceGbp]);

  React.useEffect(() => {
    if (visible && shouldCloseSheetDueToLifecycle(auction.effectiveState)) {
      setError({
        kind: auction.effectiveState === 'cancelled' ? 'auction_cancelled' : 'auction_ended',
        message: auction.effectiveState === 'cancelled'
          ? 'This auction has been cancelled.'
          : auction.effectiveState === 'settled'
            ? 'This auction has been settled.'
            : 'This auction has ended. Buy Now is no longer available.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      });
      setStage('error');
    }
  }, [visible, auction.effectiveState]);

  const canBuyNow = isBuyNowValid({
    buyNowPriceGbp: auction.buyNowPriceGbp,
    isSeller: auction.isSeller,
    effectiveState: auction.effectiveState,
    isSubmitting,
  });

  const handleConfirm = async () => {
    if (!canBuyNow || !auction.buyNowPriceGbp) return;

    // PASS 4: Authoritative preflight when stale
    let effectivePrice = authoritativePrice ?? auction.buyNowPriceGbp;
    let authoritativeState: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled' = auction.effectiveState;

    setIsPreflighting(true);
    try {
      if (isSheetStateStale(sheetOpenedAtMs, Date.now())) {
        const snapshot = await onRefreshDetail();
        if (!snapshot) {
          setError({
            kind: 'network_failure',
            message: 'Unable to verify current auction state. Check your connection and try again.',
            canRetry: true,
            transactionPossible: true,
            isAmbiguous: true,
          });
          setStage('error');
          return;
        }
        effectivePrice = snapshot.auction.buyNowPriceGbp ?? auction.buyNowPriceGbp;
        setAuthoritativePrice(effectivePrice);
        authoritativeState = (snapshot.auction.lifecycle as 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled') ?? auction.effectiveState;
        if (snapshot.auction.cancelledAt) authoritativeState = 'cancelled';
        if (snapshot.auction.settledAt) authoritativeState = 'settled';
        setSheetOpenedAtMs(Date.now());

        if (authoritativeState !== 'live') {
          setError({
            kind: authoritativeState === 'cancelled' ? 'auction_cancelled'
              : authoritativeState === 'settled' ? 'auction_settled'
              : 'auction_ended',
            message: 'This auction is no longer live. Buy Now is unavailable.',
            canRetry: false,
            transactionPossible: false,
            isAmbiguous: false,
          });
          setStage('error');
          return;
        }

        const expectedPrice = Number((authoritativePrice ?? auction.buyNowPriceGbp).toFixed(2));
        const serverPrice = Number(effectivePrice.toFixed(2));
        if (expectedPrice !== serverPrice) {
          setError({
            kind: 'buy_now_price_changed',
            message: 'The Buy Now price has changed. Please review the updated price.',
            currentBuyNowPriceGbp: serverPrice,
            canRetry: true,
            transactionPossible: true,
            isAmbiguous: false,
          });
          setStage('review');
          return;
        }
      }
    } finally {
      setIsPreflighting(false);
    }

    // PASS 5: Create idempotency key using createStableId
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createStableId();
    }

    // Use the authoritative server price as the transaction amount
    const transactionAmount = Number(effectivePrice.toFixed(2));

    setIsSubmitting(true);

    try {
      const result = await onSubmitBuyNow(transactionAmount, idempotencyKeyRef.current);
      // PASS 4: Verify the response explicitly confirms Buy Now
      if (!result.isBuyNow) {
        throw new Error('Buy Now response did not confirm purchase. Please try again.');
      }
      setStage('success');
    } catch (err) {
      const parsed = parseApiError(err, 'Unable to complete Buy Now');
      const txError = mapApiErrorToTransactionError(
        err,
        'Unable to complete Buy Now',
        parsed.code,
        parsed.status,
        parsed.message,
        parsed.isNetworkError,
        parsed.structuredDetails,
      );
      setError(txError);

      if (txError.isAmbiguous) {
        // Ambiguous failure — preserve the same idempotency key for replay
        setStage('error');
      } else if (txError.kind === 'buy_now_price_changed') {
        // Price changed — use structured price from error, refresh once, retain sheet, clear old key
        if (txError.currentBuyNowPriceGbp) {
          setAuthoritativePrice(txError.currentBuyNowPriceGbp);
        }
        // Attempt one reconciliation refresh; if it fails, the structured price above is authoritative
        const snapshot = await onRefreshDetail();
        if (snapshot) {
          const refreshedPrice = snapshot.auction.buyNowPriceGbp;
          if (refreshedPrice && refreshedPrice > 0) {
            setAuthoritativePrice(refreshedPrice);
          }
        }
        // Clear old idempotency attempt — require fresh explicit confirmation
        idempotencyKeyRef.current = null;
        setStage('review');
      } else if (txError.transactionPossible) {
        // Definitive rejection with retry possible — refresh and reset key
        await onRefreshDetail();
        idempotencyKeyRef.current = null;
        setStage('review');
      } else {
        // Definitive terminal rejection
        setStage('error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (isSubmitting) return;
    onDismiss();
  };

  const handleRetry = () => {
    setError(null);
    if (error?.isAmbiguous) {
      // Ambiguous failure — retry with the same idempotency key
      setStage('review');
    } else {
      // Definitive rejection — new key will be generated on next confirm
      idempotencyKeyRef.current = null;
      setStage('review');
    }
  };

  const displayPriceGbp = authoritativePrice ?? auction.buyNowPriceGbp;

  const priceText = displayPriceGbp
    ? formatFromFiat(displayPriceGbp, 'GBP')
    : '—';

  const displayPriceText = displayPriceGbp && currencyCode !== 'GBP'
    ? formatFromFiat(displayPriceGbp, currencyCode)
    : null;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={handleDismiss}
      snapPoint={0.55}
      blurIntensity={30}
    >
      <View style={styles.container}>
        {/* Item context header */}
        <View style={styles.itemHeader}>
          {auction.imageUrl ? (
            <CachedImage
              uri={auction.imageUrl}
              style={styles.itemThumb}
              containerStyle={styles.itemThumbContainer}
              contentFit="cover"
            />
          ) : (
            <View style={styles.itemThumbPlaceholder}>
              <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
            </View>
          )}
          <View style={styles.itemHeaderText}>
            <Headline style={styles.itemTitle} numberOfLines={1}>{auction.title}</Headline>
            <Meta style={styles.itemSeller}>by {auction.sellerName}</Meta>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Review stage — transaction receipt (also covers submitting) ── */}
        {stage === 'review' && (
          <View style={styles.stageContent}>
            {/* Receipt — hairline-divided rows */}
            <View style={styles.receiptSection}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Fixed price</Text>
                <Text style={styles.receiptValue}>{priceText}</Text>
              </View>
              {displayPriceGbp && (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>1ZE equivalent</Text>
                  <Text style={styles.receiptValue}>
                    {formatAuctionIze(toIze(displayPriceGbp, 'GBP'))}
                  </Text>
                </View>
              )}
              {displayPriceText && (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Local equivalent</Text>
                  <Text style={styles.receiptValue}>{displayPriceText} {currencyCode}</Text>
                </View>
              )}
            </View>

            {/* Total — visually dominant */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <View style={styles.totalValueCol}>
                <Text style={styles.totalValue} numberOfLines={1}>{priceText}</Text>
                {displayPriceGbp && (
                  <Text style={styles.totalIze}>
                    {formatAuctionIze(toIze(displayPriceGbp, 'GBP'))}
                  </Text>
                )}
              </View>
            </View>

            {/* Transaction consequence */}
            <Text style={styles.consequenceText}>
              This is a fixed-price purchase, not a bid. It ends the auction immediately.
            </Text>

            {error && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
                <Text style={styles.errorText}>{error.message}</Text>
              </View>
            )}

            {/* Primary action + cancel — preserves layout during submit */}
            <AppButton
              style={styles.dominantAction}
              onPress={handleConfirm}
              disabled={!canBuyNow || isPreflighting || isSubmitting}
              variant="primary"
              size="md"
              align="center"
              title={isSubmitting ? 'Processing...' : isPreflighting ? 'Checking...' : 'Confirm purchase'}
              loading={isSubmitting}
              accessibilityLabel="Confirm Buy Now purchase"
            />
            <Pressable
              style={[styles.dismissLink, isSubmitting && { opacity: 0.4 }]}
              onPress={handleDismiss}
              hitSlop={12}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Cancel Buy Now"
            >
              <Text style={styles.dismissLinkText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ── Success stage ── */}
        {stage === 'success' && (
          <View style={styles.centerStage}>
            <Ionicons name="checkmark-circle" size={36} color={Colors.success} style={styles.successIcon} />
            <Text style={styles.successTitle}>Purchase confirmed</Text>
            <Text style={styles.successDetail}>
              You bought this item for {priceText}.{'\n'}The auction has ended and is being refreshed.
            </Text>
            <AppButton
              style={styles.doneBtn}
              onPress={handleDismiss}
              variant="primary"
              size="md"
              align="center"
              title="Done"
              accessibilityLabel="Close Buy Now confirmation"
            />
          </View>
        )}

        {/* ── Error stage ── */}
        {stage === 'error' && error && (
          <View style={styles.stageContent}>
            <View style={styles.errorIconSmall}>
              <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
            </View>
            <Text style={styles.errorTitle}>{error.message}</Text>
            <View style={styles.actions}>
              {error.canRetry && (
                <AppButton
                  style={[styles.actionBtn, styles.primaryBtn]}
                  onPress={handleRetry}
                  variant="primary"
                  size="md"
                  align="center"
                  title="Try again"
                  accessibilityLabel="Retry Buy Now"
                />
              )}
              <AppButton
                style={styles.actionBtn}
                onPress={handleDismiss}
                variant="secondary"
                size="md"
                align="center"
                title="Close"
                accessibilityLabel="Close Buy Now sheet"
              />
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
  },
  itemThumbContainer: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
  },
  itemThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemHeaderText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  itemSeller: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Space.sm,
  },
  stageContent: {
    gap: Space.sm,
  },
  // ── Review receipt ──
  receiptSection: {
    gap: Space.xs + 2,
    paddingVertical: Space.sm,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    letterSpacing: -0.1,
  },
  receiptValue: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  totalLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  totalValueCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  totalValue: {
    fontSize: 20,
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  totalIze: {
    fontSize: 12,
    color: Colors.brand,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  consequenceText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    lineHeight: 18,
    paddingVertical: Space.xs,
  },
  dominantAction: {
    width: '100%',
    marginTop: Space.xs,
  },
  dismissLink: {
    alignItems: 'center',
    paddingVertical: Space.sm,
    marginTop: Space.xs,
  },
  dismissLinkText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(220,38,38,0.08)',
    marginBottom: Space.sm,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Colors.danger,
    fontFamily: Typography.family.medium,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  actionBtn: {
    flex: 1,
  },
  primaryBtn: {},
  centerStage: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.md,
  },
  successIcon: {
    marginBottom: Space.xs,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  successDetail: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
  doneBtn: {
    minWidth: 160,
    marginTop: Space.sm,
  },
  errorIcon: {
    marginBottom: Space.xs,
  },
  errorIconSmall: {
    marginBottom: Space.xs,
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
});
