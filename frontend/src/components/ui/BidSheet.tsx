import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { AppButton } from './AppButton';
import { AppInput } from './AppInput';
import { CachedImage } from '../CachedImage';
import { Meta, Headline } from './Text';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  sanitizeDecimalInput,
} from '../../utils/currencyAuthoringFlows';
import { toIze, formatIzeAmount } from '../../utils/currency';
import { createStableId } from '../../utils/createStableId';
import { haptics } from '../../utils/haptics';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import { DEFAULT_CURRENCY_CODE } from '../../constants/currencies';
import type { GoldRates } from '../../utils/currency';
import type { AuctionDetailResponse } from '../../services/marketApi';
import {
  validateBidEntry,
  applyQuickIncrement,
  mapApiErrorToTransactionError,
  formatGbpEquivalent,
  getSuggestedBid,
  shouldCloseSheetDueToLifecycle,
  isSheetStateStale,
  type BidSheetStage,
  type TransactionError,
} from '../../utils/transactionSheetLogic';
import { parseApiError } from '../../lib/apiClient';

export interface BidSheetAuctionContext {
  id: string;
  title: string;
  imageUrl: string | null;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  endsAt: string;
  sellerName: string;
  effectiveState: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled';
  isSeller: boolean;
  countdownText: string;
}

interface BidSheetProps {
  visible: boolean;
  onDismiss: () => void;
  auction: BidSheetAuctionContext;
  currencyCode: SupportedCurrencyCode;
  goldRates: Partial<GoldRates>;
  formatFromFiat: (amount: number, currency?: SupportedCurrencyCode, opts?: any) => string;
  onSubmitBid: (gbpAmount: number, idempotencyKey: string) => Promise<void>;
  onRefreshDetail: () => Promise<AuctionDetailResponse | null>;
  onReviewBuyNow?: () => void;
  serverClockMs: number;
  /** Pre-fill the bid input with this amount (GBP) � e.g. from an outbid notification */
  initialBidAmount?: number;
}

export function BidSheet({
  visible,
  onDismiss,
  auction,
  currencyCode,
  goldRates,
  formatFromFiat,
  onSubmitBid,
  onRefreshDetail,
  onReviewBuyNow,
  serverClockMs,
  initialBidAmount,
}: BidSheetProps) {
  const { colors } = useAppTheme();
  // Map theme colors to the legacy Colors interface so the static
  // StyleSheet can use themed values. This is a migration bridge �
  // the static styles below reference these via the `themed` object.
  const themed = {
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    brand: colors.brand,
    border: colors.border,
    borderSubtle: colors.borderSubtle,
    surface: colors.surface,
    surfaceAlt: colors.surfaceAlt,
    surfaceElevated: colors.surfaceElevated,
    danger: colors.danger,
    dangerSubtle: colors.dangerSubtle,
    success: colors.success,
    warning: colors.warning,
    background: colors.background,
    textInverse: colors.textInverse,
  };
  const styles = React.useMemo(() => createStyles(themed), [themed]);
  const [stage, setStage] = React.useState<BidSheetStage>('entry');
  const [bidInput, setBidInput] = React.useState('');
  const [error, setError] = React.useState<TransactionError | null>(null);
  const [gbpAmount, setGbpAmount] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isPreflighting, setIsPreflighting] = React.useState(false);
  const [sheetOpenedAtMs, setSheetOpenedAtMs] = React.useState(0);
  const [currentMinimum, setCurrentMinimum] = React.useState(auction.minimumNextBidGbp);
  const idempotencyKeyRef = React.useRef<string | null>(null);

  // Shared authoritative snapshot helper — returns refreshed state or null on failure
  const getAuthoritativeSnapshot = async (): Promise<{
    minimumNextBidGbp: number;
    effectiveState: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled';
  } | null> => {
    if (!isSheetStateStale(sheetOpenedAtMs, Date.now())) {
      return {
        minimumNextBidGbp: currentMinimum,
        effectiveState: auction.effectiveState,
      };
    }
    const snapshot = await onRefreshDetail();
    if (!snapshot) {
      return null;
    }
    const minFromSnapshot = snapshot.auction.minimumNextBidGbp;
    setCurrentMinimum(minFromSnapshot);
    setSheetOpenedAtMs(Date.now());
    const snapshotState: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled' =
      snapshot.auction.cancelledAt ? 'cancelled'
      : snapshot.auction.settledAt ? 'settled'
      : snapshot.auction.lifecycle;
    return { minimumNextBidGbp: minFromSnapshot, effectiveState: snapshotState };
  };

  // Reset on open
  React.useEffect(() => {
    if (visible) {
      // Use pre-filled amount from notification if provided, otherwise calculate suggested bid
      const suggested = initialBidAmount
        ? initialBidAmount.toFixed(2)
        : getSuggestedBid(auction.minimumNextBidGbp, currencyCode, goldRates);
      setBidInput(suggested);
      setStage('entry');
      setError(null);
      setGbpAmount(null);
      setIsSubmitting(false);
      setCurrentMinimum(auction.minimumNextBidGbp);
      setSheetOpenedAtMs(Date.now());
      idempotencyKeyRef.current = null;
    }
  }, [visible, auction.minimumNextBidGbp, currencyCode, goldRates, initialBidAmount]);

  // Lifecycle guard — close sheet if auction transitions to terminal
  React.useEffect(() => {
    if (visible && shouldCloseSheetDueToLifecycle(auction.effectiveState)) {
      setError({
        kind: auction.effectiveState === 'cancelled' ? 'auction_cancelled' : 'auction_ended',
        message: auction.effectiveState === 'cancelled'
          ? 'This auction has been cancelled.'
          : auction.effectiveState === 'settled'
            ? 'This auction has been settled.'
            : 'This auction has ended. Bidding is no longer available.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      });
      setStage('error');
    }
  }, [visible, auction.effectiveState]);

  // Update minimum if auction detail refreshed
  React.useEffect(() => {
    if (visible) {
      setCurrentMinimum(auction.minimumNextBidGbp);
    }
  }, [auction.minimumNextBidGbp, visible]);

  const handleInputChange = (v: string) => {
    setBidInput(sanitizeDecimalInput(v));
    setError(null);
  };

  const handleQuickIncrement = (pct: number) => {
    setBidInput(applyQuickIncrement(bidInput, pct, currentMinimum, currencyCode, goldRates));
    setError(null);
  };

  const handleProceedToReview = async () => {
    setIsPreflighting(true);
    try {
      const snapshot = await getAuthoritativeSnapshot();
      if (!snapshot) {
        setError({
          kind: 'network_failure',
          message: 'Unable to verify current auction state. Check your connection and try again.',
          canRetry: true,
          transactionPossible: true,
          isAmbiguous: true,
        });
        return;
      }

      const result = validateBidEntry(bidInput, currencyCode, goldRates, {
        minimumNextBidGbp: snapshot.minimumNextBidGbp,
        isSeller: auction.isSeller,
        effectiveState: snapshot.effectiveState,
        isSubmitting,
      });

      if (!result.valid || !result.gbpAmount) {
        setError(result.error);
        return;
      }

      const validatedGbpAmount = result.gbpAmount;
      setGbpAmount(validatedGbpAmount);
      setError(null);
      setStage('review');
    } finally {
      setIsPreflighting(false);
    }
  };

  const handleConfirmBid = async () => {
    if (isSubmitting || gbpAmount === null) return;

    setIsPreflighting(true);
    let validatedGbpAmount = gbpAmount;

    try {
      const snapshot = await getAuthoritativeSnapshot();
      if (!snapshot) {
        setError({
          kind: 'network_failure',
          message: 'Unable to verify current auction state. Check your connection and try again.',
          canRetry: true,
          transactionPossible: true,
          isAmbiguous: true,
        });
        setStage('entry');
        return;
      }

      // Re-validate after refresh using the returned snapshot values
      const result = validateBidEntry(bidInput, currencyCode, goldRates, {
        minimumNextBidGbp: snapshot.minimumNextBidGbp,
        isSeller: auction.isSeller,
        effectiveState: snapshot.effectiveState,
        isSubmitting,
      });
      if (!result.valid || !result.gbpAmount) {
        setError(result.error);
        setStage('entry');
        return;
      }
      validatedGbpAmount = result.gbpAmount;
      setGbpAmount(validatedGbpAmount);
    } finally {
      setIsPreflighting(false);
    }

    // PASS 5: Create idempotency key using createStableId, once per attempt
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createStableId();
    }

    setIsSubmitting(true);
    setStage('submitting');

    try {
      // Submit the validated local variable, not stale state
      await onSubmitBid(validatedGbpAmount, idempotencyKeyRef.current);
      setStage('success');
      haptics.success();
    } catch (err) {
      const parsed = parseApiError(err, 'Unable to place bid');
      const txError = mapApiErrorToTransactionError(
        err,
        'Unable to place bid',
        parsed.code,
        parsed.status,
        parsed.message,
        parsed.isNetworkError,
        parsed.structuredDetails,
      );
      setError(txError);

      if (txError.isAmbiguous) {
        // Ambiguous failure — preserve the same idempotency key for replay
        // Do NOT reset the key. User retries with the same key.
        setStage('error');
      } else if (txError.kind === 'buy_now_review_required') {
        // Recoverable conflict — refresh detail once to get authoritative Buy Now price
        await onRefreshDetail();
        // Preserve the entered bid so user can return to it
        // Do NOT reset idempotency key — this was a definitive rejection, not a transaction
        idempotencyKeyRef.current = null;
        setStage('recoverable_conflict');
      } else if (txError.transactionPossible) {
        // Definitive rejection with retry possible — refresh and reset key for new attempt
        await onRefreshDetail();
        if (txError.updatedMinimumGbp) {
          setCurrentMinimum(txError.updatedMinimumGbp);
        }
        idempotencyKeyRef.current = null;
        setStage('entry');
      } else {
        // Definitive terminal rejection — no retry
        setStage('error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditFromReview = () => {
    setStage('entry');
    setError(null);
  };

  const handleDismiss = () => {
    if (isSubmitting) return;
    onDismiss();
  };

  const handleRetry = () => {
    setError(null);
    if (error?.isAmbiguous) {
      // Ambiguous failure — retry with the same idempotency key
      // Key is preserved, go back to review to confirm retry
      setStage('review');
    } else {
      // Definitive rejection — new key will be generated on next confirm
      idempotencyKeyRef.current = null;
      setStage('entry');
    }
  };

  const displayAmount = Number(bidInput);
  const gbpEquivalentText = formatGbpEquivalent(displayAmount, gbpAmount ?? 0, currencyCode);
  const isNonGbp = currencyCode !== 'GBP';

  return (
    <BottomSheet
      visible={visible}
      onDismiss={handleDismiss}
      snapPoint={0.65}
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
              <Ionicons name="image-outline" size={20} color={themed.textMuted} />
            </View>
          )}
          <View style={styles.itemHeaderText}>
            <Headline style={styles.itemTitle} numberOfLines={1}>{auction.title}</Headline>
            <Meta style={styles.itemSeller}>by {auction.sellerName}</Meta>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Entry stage — context first, then amount, then action ──
            P1-C bid composer order: current bid → minimum next bid →
            amount field → primary bid action. */}
        {stage === 'entry' && (
          <View style={styles.stageContent}>
            {/* Current bid + minimum to lead — context before input */}
            <View style={styles.bidContextStack}>
              <View style={styles.bidContextRow}>
                <Text style={styles.bidContextLabel}>Current bid</Text>
                <Text style={styles.bidContextValue}>{formatFromFiat(auction.currentBidGbp, DEFAULT_CURRENCY_CODE)}</Text>
              </View>
              <View style={styles.bidContextRow}>
                <Text style={styles.bidContextLabel}>Minimum to lead</Text>
                <Text style={styles.bidContextValue}>{formatFromFiat(currentMinimum, DEFAULT_CURRENCY_CODE)}</Text>
              </View>
              <View style={styles.bidContextRow}>
                <Text style={styles.bidContextLabel}>Time remaining</Text>
                <Text style={[styles.bidContextValueSecondary, auction.effectiveState === 'live' && { color: themed.danger }]}>
                  {auction.countdownText}
                </Text>
              </View>
            </View>

            <Text style={styles.entryHeading}>PLACE YOUR BID</Text>

            {/* Large amount input — dominates the sheet */}
            <View style={styles.amountContainer}>
              <Text style={styles.amountCurrency}>{currencyCode}</Text>
              <AppInput
                value={bidInput}
                onChangeText={handleInputChange}
                keyboardType="decimal-pad"
                placeholder="0.00"
                accessibilityLabel="Bid amount"
                accessibilityHint={`Enter your bid in ${currencyCode}`}
                containerStyle={styles.amountInput}
                autoFocus
              />
            </View>

            {/* 1ZE equivalent — platform value */}
            <Text style={styles.amountIzeEquivalent}>
              {formatIzeAmount(toIze(Number(bidInput) || 0, currencyCode, goldRates), 2)}
            </Text>

            {/* Quick adjustments */}
            <View style={styles.incrementRow}>
              {[0.01, 0.03, 0.05].map((pct) => (
                <Pressable
                  key={pct}
                  style={({ pressed }) => [
                    styles.incrementChip,
                    pressed && styles.incrementChipPressed,
                  ]}
                  onPress={() => handleQuickIncrement(pct)}
                  disabled={isPreflighting || isSubmitting}
                  accessibilityLabel={`Increase bid by ${Math.round(pct * 100)} percent`}
                  accessibilityRole="button"
                >
                  <Text style={styles.incrementText}>+{Math.round(pct * 100)}%</Text>
                </Pressable>
              ))}
            </View>

            {/* Bid confidence indicator — shows if the current amount would lead */}
            {(() => {
              const bidGbp = gbpAmount ?? 0;
              const wouldLead = bidGbp >= currentMinimum && bidGbp > 0;
              if (bidGbp <= 0) return null;
              return (
                <View style={[styles.confidenceRow, { backgroundColor: wouldLead ? `${themed.success}10` : `${themed.danger}10` }]}>
                  <Ionicons
                    name={wouldLead ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                    size={14}
                    color={wouldLead ? themed.success : themed.danger}
                  />
                  <Text style={[styles.confidenceText, { color: wouldLead ? themed.success : themed.danger }]}>
                    {wouldLead ? 'This bid would put you in the lead' : 'Below minimum to lead — increase your bid'}
                  </Text>
                </View>
              );
            })()}

            {error && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color={themed.danger} />
                <Text style={styles.errorText}>{error.message}</Text>
              </View>
            )}

            {/* Single dominant action */}
            <AppButton
              style={styles.dominantAction}
              onPress={handleProceedToReview}
              variant="primary"
              size="md"
              align="center"
              title={isPreflighting ? 'Checking...' : 'Review bid'}
              disabled={isPreflighting || isSubmitting}
              accessibilityLabel="Review your bid"
            />
            <Pressable
              style={styles.dismissLink}
              onPress={handleDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cancel bid"
            >
              <Text style={styles.dismissLinkText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ── Review stage — clean confirmation receipt ── */}
        {stage === 'review' && (
          <View style={styles.stageContent}>
            <Text style={styles.reviewHeading}>CONFIRM YOUR BID</Text>

            {/* Dominant bid amount */}
            <View style={styles.reviewAmountBlock}>
              <Text style={styles.reviewAmountValue} numberOfLines={1} accessibilityLabel={`${currencyCode} ${bidInput}`}>
                {currencyCode} {bidInput}
              </Text>
              <Text style={styles.reviewAmountIze}>
                {formatIzeAmount(gbpAmount ? toIze(gbpAmount, 'GBP', goldRates) : 0, 2)}
              </Text>
              {isNonGbp && gbpEquivalentText && (
                <Text style={styles.reviewGbpEquivalent}>{gbpEquivalentText}</Text>
              )}
            </View>

            {/* Receipt details */}
            <View style={styles.reviewReceipt}>
              <View style={styles.reviewReceiptRow}>
                <Text style={styles.reviewReceiptLabel}>Current value</Text>
                <Text style={styles.reviewReceiptValue}>{formatFromFiat(auction.currentBidGbp, DEFAULT_CURRENCY_CODE)}</Text>
              </View>
              <View style={styles.reviewReceiptRow}>
                <Text style={styles.reviewReceiptLabel}>Minimum to lead</Text>
                <Text style={styles.reviewReceiptValue}>{formatFromFiat(currentMinimum, DEFAULT_CURRENCY_CODE)}</Text>
              </View>
              <View style={styles.reviewReceiptRow}>
                <Text style={styles.reviewReceiptLabel}>Time remaining</Text>
                <Text style={styles.reviewReceiptValue}>{auction.countdownText}</Text>
              </View>
              <View style={styles.reviewReceiptRow}>
                <Text style={styles.reviewReceiptLabel}>Seller</Text>
                <Text style={styles.reviewReceiptValue}>{auction.sellerName}</Text>
              </View>
            </View>

            {/* P1-C: Pre-submit confirmation must state amount, binding
                nature, fees/total if applicable, and cancellation rule. */}
            <View style={styles.commitmentBlock}>
              <View style={styles.commitmentRow}>
                <Ionicons name="information-circle-outline" size={14} color={themed.textSecondary} />
                <Text style={styles.commitmentText}>
                  Bids are binding once accepted.
                </Text>
              </View>
              <View style={styles.commitmentRow}>
                <Ionicons name="lock-closed-outline" size={14} color={themed.textSecondary} />
                <Text style={styles.commitmentText}>
                  You cannot cancel a bid after it is submitted.
                </Text>
              </View>
            </View>

            {error && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color={themed.danger} />
                <Text style={styles.errorText}>{error.message}</Text>
              </View>
            )}

            {/* Single dominant action + quiet edit */}
            <AppButton
              style={styles.dominantAction}
              onPress={handleConfirmBid}
              variant="primary"
              size="md"
              align="center"
              title={isPreflighting ? 'Checking...' : 'Confirm bid'}
              disabled={isPreflighting || isSubmitting}
              accessibilityLabel="Confirm and submit your bid"
            />
            <Pressable
              style={styles.dismissLink}
              onPress={handleEditFromReview}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Edit your bid"
            >
              <Text style={styles.dismissLinkText}>Edit bid</Text>
            </Pressable>
          </View>
        )}

        {/* ── Submitting stage ── */}
        {stage === 'submitting' && (
          <View style={styles.centerStage}>
            <View style={styles.submittingSpinnerWrap}>
              <Ionicons name="hourglass-outline" size={40} color={themed.brand} />
            </View>
            <Text style={styles.submittingText}>Submitting your bid...</Text>
            <Text style={styles.submittingDetail}>This may take a moment.</Text>
          </View>
        )}

        {/* ── Success stage ── */}
        {stage === 'success' && (
          <View style={styles.centerStage}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={56} color={themed.success} />
            </View>
            <Text style={styles.successTitle}>Bid placed</Text>
            <Text style={styles.successDetail}>
              Your bid of {formatFromFiat(gbpAmount ?? 0, DEFAULT_CURRENCY_CODE)} has been submitted
            </Text>
            <AppButton
              style={styles.doneBtn}
              onPress={handleDismiss}
              variant="primary"
              size="md"
              align="center"
              title="Done"
              accessibilityLabel="Close bid confirmation"
            />
          </View>
        )}

        {/* ── Recoverable conflict stage ── */}
        {stage === 'recoverable_conflict' && error && error.kind === 'buy_now_review_required' && (
          <View style={styles.stageContent}>
            <View style={styles.conflictIconRow}>
              <Ionicons name="information-circle-outline" size={28} color={themed.brand} />
            </View>
            <Text style={styles.conflictHeading}>Consider Buy Now</Text>
            <Text style={styles.conflictExplanation}>{error.message}</Text>
            {error.buyNowPriceGbp && (
              <View style={styles.conflictPriceRow}>
                <Meta style={styles.conflictPriceLabel}>Buy Now price</Meta>
                <Text style={styles.conflictPriceValue}>
                  {formatFromFiat(error.buyNowPriceGbp, DEFAULT_CURRENCY_CODE)}
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <AppButton
                style={styles.actionBtn}
                onPress={handleEditFromReview}
                variant="secondary"
                size="md"
                align="center"
                title="Edit bid"
                accessibilityLabel="Edit your bid amount"
              />
              <AppButton
                style={[styles.actionBtn, styles.primaryBtn]}
                onPress={onReviewBuyNow}
                variant="primary"
                size="md"
                align="center"
                title="Review Buy Now"
                accessibilityLabel="Review Buy Now to purchase this item immediately"
              />
            </View>
          </View>
        )}

        {/* ── Error (terminal) stage ── */}
        {stage === 'error' && error && (
          <View style={styles.stageContent}>
            <View style={styles.errorIconSmall}>
              <Ionicons name="alert-circle-outline" size={24} color={themed.danger} />
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
                  accessibilityLabel="Retry bid"
                />
              )}
              <AppButton
                style={styles.actionBtn}
                onPress={handleDismiss}
                variant="secondary"
                size="md"
                align="center"
                title="Close"
                accessibilityLabel="Close bid sheet"
              />
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const createStyles = (themed: {
  textPrimary: string; textSecondary: string; textMuted: string;
  brand: string; border: string; borderSubtle: string;
  surface: string; surfaceAlt: string; surfaceElevated: string;
  danger: string; dangerSubtle: string; success: string; warning: string;
  background: string; textInverse: string;
}) => StyleSheet.create({
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
    backgroundColor: themed.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemHeaderText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: themed.textPrimary,
  },
  itemSeller: {
    fontSize: Type.caption.size,
    color: themed.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: themed.border,
    marginBottom: Space.sm,
  },
  stageContent: {
    gap: Space.sm,
  },
  // ── Entry stage — large centered amount ──
  entryHeading: {
    fontSize: Type.meta.size,
    color: themed.textMuted,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: Space.xs,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  amountCurrency: {
    fontSize: Type.priceList.size,
    color: themed.textMuted,
    fontFamily: Typography.family.semibold,
  },
  amountInput: {
    flex: 1,
  },
  amountIzeEquivalent: {
    fontSize: Type.caption.size,
    color: themed.brand,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
    marginBottom: Space.sm,
    fontVariant: ['tabular-nums'],
  },
  bidContextStack: {
    gap: Space.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themed.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themed.border,
    paddingVertical: Space.sm,
  },
  bidContextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bidContextLabel: {
    fontSize: Type.meta.size - 2,
    color: themed.textMuted,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bidContextValue: {
    fontSize: Type.bodyStrong.size,
    color: themed.textPrimary,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  bidContextValueSecondary: {
    fontSize: Type.body.size,
    color: themed.textSecondary,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
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
    fontSize: Type.body.size,
    color: themed.textMuted,
    fontFamily: Typography.family.regular,
  },
  // ── Review stage — receipt ──
  reviewHeading: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: themed.textMuted,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: Space.sm,
    textTransform: 'uppercase',
  },
  reviewAmountBlock: {
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  reviewAmountValue: {
    fontSize: Type.display.size + 4,
    lineHeight: Type.display.lineHeight + 4,
    fontWeight: '700',
    letterSpacing: Type.display.letterSpacing,
    color: themed.textPrimary,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  reviewAmountIze: {
    fontSize: Type.body.size,
    color: themed.brand,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  reviewGbpEquivalent: {
    fontSize: Type.caption.size,
    color: themed.textMuted,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  reviewReceipt: {
    gap: Space.xs + 2,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themed.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themed.border,
  },
  reviewReceiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewReceiptLabel: {
    fontSize: Type.meta.size - 2,
    color: themed.textMuted,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.5,
  },
  reviewReceiptValue: {
    fontSize: Type.body.size,
    color: themed.textPrimary,
    fontFamily: Typography.family.medium,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs,
  },
  izeEquivalentText: {
    fontSize: Type.meta.size,
    color: themed.textMuted,
    fontFamily: Typography.family.regular,
    marginBottom: Space.xs,
  },
  countdownText: {
    fontSize: Type.caption.size,
    color: themed.textSecondary,
    fontFamily: Typography.family.medium,
  },
  input: {
    marginBottom: Space.xs,
  },
  incrementRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  incrementChip: {
    flex: 1,
    paddingVertical: Space.sm,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: themed.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themed.border,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  incrementChipPressed: {
    backgroundColor: themed.border,
    opacity: 0.7,
  },
  incrementText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: themed.textPrimary,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginBottom: Space.sm,
  },
  confidenceText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    lineHeight: Type.caption.lineHeight,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: themed.dangerSubtle,
    marginBottom: Space.sm,
  },
  errorText: {
    flex: 1,
    fontSize: Type.caption.size,
    color: themed.danger,
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
  reviewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: themed.border,
    marginVertical: Space.xs,
  },
  commitmentBlock: {
    gap: Space.xs / 2,
    paddingVertical: Space.xs,
  },
  commitmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs / 2,
  },
  commitmentText: {
    fontSize: Type.caption.size,
    color: themed.textSecondary,
    fontFamily: Typography.family.regular,
  },
  centerStage: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.md,
  },
  submittingText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: themed.textPrimary,
  },
  submittingSpinnerWrap: {
    marginBottom: Space.xs,
  },
  submittingDetail: {
    fontSize: Type.caption.size,
    color: themed.textMuted,
    fontFamily: Typography.family.regular,
  },
  successIcon: {
    marginBottom: Space.xs,
  },
  successTitle: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.semibold,
    color: themed.textPrimary,
  },
  successDetail: {
    fontSize: Type.body.size,
    color: themed.textSecondary,
    fontFamily: Typography.family.medium,
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
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: themed.textPrimary,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
  conflictIconRow: {
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  conflictHeading: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.semibold,
    color: themed.textPrimary,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  conflictExplanation: {
    fontSize: Type.bodyStrong.size,
    color: themed.textSecondary,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingHorizontal: Space.sm,
    marginBottom: Space.md,
  },
  conflictPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    backgroundColor: themed.surfaceAlt,
    borderRadius: Radius.md,
    marginBottom: Space.md,
  },
  conflictPriceLabel: {
    fontSize: Type.body.size,
    color: themed.textSecondary,
  },
  conflictPriceValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: themed.textPrimary,
  },
});

