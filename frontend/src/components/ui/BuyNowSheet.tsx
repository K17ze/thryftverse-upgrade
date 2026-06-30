import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { AppButton } from './AppButton';
import { CachedImage } from '../CachedImage';
import { Meta, Body, Headline } from './Text';
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
  const idempotencyKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setStage('review');
      setError(null);
      setIsSubmitting(false);
      setIsPreflighting(false);
      setSheetOpenedAtMs(Date.now());
      idempotencyKeyRef.current = null;
    }
  }, [visible]);

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
    let authoritativePrice = auction.buyNowPriceGbp;
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
        authoritativePrice = snapshot.auction.buyNowPriceGbp ?? auction.buyNowPriceGbp;
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

        const expectedPrice = Number(auction.buyNowPriceGbp.toFixed(2));
        const serverPrice = Number(authoritativePrice.toFixed(2));
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
    const transactionAmount = Number(authoritativePrice.toFixed(2));

    setIsSubmitting(true);
    setStage('submitting');

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
      );
      setError(txError);

      if (txError.isAmbiguous) {
        // Ambiguous failure — preserve the same idempotency key for replay
        setStage('error');
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

  const priceText = auction.buyNowPriceGbp
    ? formatFromFiat(auction.buyNowPriceGbp, 'GBP', { displayMode: 'fiat' })
    : '—';

  const displayPriceText = auction.buyNowPriceGbp && currencyCode !== 'GBP'
    ? formatFromFiat(auction.buyNowPriceGbp, currencyCode, { displayMode: 'fiat' })
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

        {/* ── Review stage ── */}
        {stage === 'review' && (
          <View style={styles.stageContent}>
            <Text style={styles.reviewHeading}>Buy Now</Text>

            <View style={styles.priceBlock}>
              <Text style={styles.priceValue}>{priceText}</Text>
              {displayPriceText && (
                <Text style={styles.priceEquivalent}>
                  approximately {displayPriceText} {currencyCode}
                </Text>
              )}
            </View>

            <View style={styles.infoBlock}>
              <View style={styles.infoRow}>
                <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
                <Body style={styles.infoText}>
                  This is a fixed-price purchase, not a bid.
                </Body>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="close-circle-outline" size={14} color={Colors.textSecondary} />
                <Body style={styles.infoText}>
                  This will immediately end the auction.
                </Body>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="card-outline" size={14} color={Colors.textSecondary} />
                <Body style={styles.infoText}>
                  You are committing to purchase this item at the fixed price.
                </Body>
              </View>
            </View>

            {error && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
                <Text style={styles.errorText}>{error.message}</Text>
              </View>
            )}

            <View style={styles.actions}>
              <AppButton
                style={styles.actionBtn}
                onPress={handleDismiss}
                variant="secondary"
                size="md"
                align="center"
                title="Cancel"
                accessibilityLabel="Cancel Buy Now"
              />
              <AppButton
                style={[styles.actionBtn, styles.primaryBtn]}
                onPress={handleConfirm}
                disabled={!canBuyNow || isPreflighting || isSubmitting}
                variant="primary"
                size="md"
                align="center"
                title={isPreflighting ? 'Checking...' : 'Confirm Buy Now'}
                accessibilityLabel="Confirm Buy Now purchase"
              />
            </View>
          </View>
        )}

        {/* ── Submitting stage ── */}
        {stage === 'submitting' && (
          <View style={styles.centerStage}>
            <Text style={styles.submittingText}>Processing...</Text>
          </View>
        )}

        {/* ── Success stage ── */}
        {stage === 'success' && (
          <View style={styles.centerStage}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.brand} />
            </View>
            <Text style={styles.successTitle}>Buy Now accepted</Text>
            <Text style={styles.successDetail}>
              The auction has ended. Result is being refreshed.
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
          <View style={styles.centerStage}>
            <View style={styles.errorIcon}>
              <Ionicons name="close-circle" size={48} color={Colors.danger} />
            </View>
            <Text style={styles.errorTitle}>{error.message}</Text>
            {!error.transactionPossible && (
              <AppButton
                style={styles.doneBtn}
                onPress={handleDismiss}
                variant="primary"
                size="md"
                align="center"
                title="Close"
                accessibilityLabel="Close Buy Now sheet"
              />
            )}
            {error.canRetry && (
              <AppButton
                style={styles.doneBtn}
                onPress={handleRetry}
                variant="primary"
                size="md"
                align="center"
                title="Try again"
                accessibilityLabel="Retry Buy Now"
              />
            )}
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
  reviewHeading: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  priceBlock: {
    paddingVertical: Space.sm,
    alignItems: 'center',
  },
  priceValue: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  priceEquivalent: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    marginTop: 4,
  },
  infoBlock: {
    gap: Space.xs + 2,
    paddingVertical: Space.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
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
  submittingText: {
    fontSize: 16,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
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
  errorTitle: {
    fontSize: 16,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
});
