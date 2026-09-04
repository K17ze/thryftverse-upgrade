import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { AppButton } from './AppButton';
import { AppInput } from './AppInput';
import { CachedImage } from '../CachedImage';
import { Meta, Headline } from './Text';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  sanitizeDecimalInput,
  convertDisplayToGbpAmount } from '../../utils/currencyAuthoringFlows';
import { toIze, formatIzeAmount } from '../../utils/currency';
import { createStableId } from '../../utils/createStableId';
import { haptics } from '../../utils/haptics';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import type { FxRates } from '../../utils/currency';
import type { AuctionDetailResponse } from '../../services/marketApi';
import type { AuctionEffectiveState } from '../../hooks/useServerClock';
import {
  validateBidEntry,
  applyQuickIncrement,
  mapApiErrorToTransactionError,
  formatGbpEquivalent,
  getSuggestedBid,
  shouldCloseSheetDueToLifecycle,
  isSheetStateStale,
  type BidSheetStage,
  type TransactionError } from '../../utils/transactionSheetLogic';
import { parseApiError } from '../../lib/apiClient';
import { useUnknownOutcomeReconciliation } from '../../hooks/useUnknownOutcomeReconciliation';
import { lookupAuctionBidByIdempotencyKey, type MarketAuctionBid } from '../../services/marketApi';

export interface BidSheetAuctionContext {
  id: string;
  title: string;
  imageUrl: string | null;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  endsAt: string;
  sellerName: string;
  effectiveState: AuctionEffectiveState;
  isSeller: boolean;
  countdownText: string;
}

interface BidSheetProps {
  visible: boolean;
  onDismiss: () => void;
  auction: BidSheetAuctionContext;
  currencyCode: SupportedCurrencyCode;
  fxRates: Partial<FxRates>;
  formatFromFiat: (amount: number, currency?: SupportedCurrencyCode, opts?: any) => string;
  onSubmitBid: (gbpAmount: number, idempotencyKey: string, maxBidGbp?: number) => Promise<void>;
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
  fxRates,
  formatFromFiat,
  onSubmitBid,
  onRefreshDetail,
  onReviewBuyNow,
  serverClockMs,
  initialBidAmount }: BidSheetProps) {
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
    successSubtle: colors.successSubtle,
    warning: colors.warning,
    background: colors.background,
    textInverse: colors.textInverse };
  const styles = React.useMemo(() => createStyles(themed), [themed]);
  const [stage, setStage] = React.useState<BidSheetStage>('entry');
  const [bidInput, setBidInput] = React.useState('');
  const [error, setError] = React.useState<TransactionError | null>(null);
  const [gbpAmount, setGbpAmount] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isPreflighting, setIsPreflighting] = React.useState(false);
  const [sheetOpenedAtMs, setSheetOpenedAtMs] = React.useState(0);
  const [currentMinimum, setCurrentMinimum] = React.useState(auction.minimumNextBidGbp);
  // Proxy bidding (max bid) state
  const [proxyEnabled, setProxyEnabled] = React.useState(false);
  const [maxBidInput, setMaxBidInput] = React.useState('');
  const [maxBidGbp, setMaxBidGbp] = React.useState<number | null>(null);
  const idempotencyKeyRef = React.useRef<string | null>(null);
  const isMountedRef = React.useRef(true);
  const { reconcile } = useUnknownOutcomeReconciliation();

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Shared authoritative snapshot helper — returns refreshed state or null on failure
  const getAuthoritativeSnapshot = async (): Promise<{
    minimumNextBidGbp: number;
    effectiveState: AuctionEffectiveState;
  } | null> => {
    if (!isSheetStateStale(sheetOpenedAtMs, Date.now())) {
      return {
        minimumNextBidGbp: currentMinimum,
        effectiveState: auction.effectiveState };
    }
    const snapshot = await onRefreshDetail();
    if (!snapshot) {
      return null;
    }
    const minFromSnapshot = snapshot.auction.minimumNextBidGbp;
    setCurrentMinimum(minFromSnapshot);
    setSheetOpenedAtMs(Date.now());
    const snapshotState: AuctionEffectiveState =
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
        : getSuggestedBid(auction.minimumNextBidGbp, currencyCode, fxRates);
      setBidInput(suggested);
      setStage('entry');
      setError(null);
      setGbpAmount(null);
      setIsSubmitting(false);
      setCurrentMinimum(auction.minimumNextBidGbp);
      setSheetOpenedAtMs(Date.now());
      setProxyEnabled(false);
      setMaxBidInput('');
      setMaxBidGbp(null);
      idempotencyKeyRef.current = null;
    }
  }, [visible, auction.minimumNextBidGbp, currencyCode, fxRates, initialBidAmount]);

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
        isAmbiguous: false });
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
    haptics.selection();
    setBidInput(applyQuickIncrement(bidInput, pct, currentMinimum, currencyCode, fxRates));
    setError(null);
  };

  // Validate the optional proxy max bid. Returns the validated GBP amount
  // or null with an error set on the caller's behalf.
  const validateMaxBid = (
    maxBidDisplay: string,
    bidGbp: number,
    minGbp: number,
  ): { gbp: number | null; error: TransactionError | null } => {
    const raw = Number(maxBidDisplay);
    if (!Number.isFinite(raw) || raw <= 0) {
      return {
        gbp: null,
        error: {
          kind: 'invalid_amount',
          message: 'Enter a maximum bid.',
          canRetry: true,
          transactionPossible: true,
          isAmbiguous: false } };
    }
    const maxGbp = convertDisplayToGbpAmount(raw, currencyCode, fxRates);
    if (!Number.isFinite(maxGbp) || maxGbp <= 0) {
      return {
        gbp: null,
        error: {
          kind: 'invalid_amount',
          message: 'Couldn\'t convert maximum bid to this currency.',
          canRetry: true,
          transactionPossible: true,
          isAmbiguous: false } };
    }
    if (maxGbp < bidGbp) {
      return {
        gbp: null,
        error: {
          kind: 'invalid_amount',
          message: 'Maximum bid must be at least your bid amount.',
          canRetry: true,
          transactionPossible: true,
          isAmbiguous: false } };
    }
    if (maxGbp < minGbp) {
      return {
        gbp: null,
        error: {
          kind: 'below_minimum',
          message: 'Maximum bid is below the minimum to lead.',
          canRetry: true,
          transactionPossible: true,
          isAmbiguous: false } };
    }
    return { gbp: maxGbp, error: null };
  };

  const handleMaxBidChange = (v: string) => {
    setMaxBidInput(sanitizeDecimalInput(v));
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
          isAmbiguous: true });
        return;
      }

      const result = validateBidEntry(bidInput, currencyCode, fxRates, {
        minimumNextBidGbp: snapshot.minimumNextBidGbp,
        isSeller: auction.isSeller,
        effectiveState: snapshot.effectiveState,
        isSubmitting });

      if (!result.valid || !result.gbpAmount) {
        setError(result.error);
        return;
      }

      const validatedGbpAmount = result.gbpAmount;

      // Validate optional proxy max bid against the authoritative snapshot
      if (proxyEnabled) {
        const maxResult = validateMaxBid(maxBidInput, validatedGbpAmount, snapshot.minimumNextBidGbp);
        if (maxResult.error) {
          setError(maxResult.error);
          return;
        }
        setMaxBidGbp(maxResult.gbp);
      } else {
        setMaxBidGbp(null);
      }

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
    let validatedMaxBidGbp: number | null = null;

    try {
      const snapshot = await getAuthoritativeSnapshot();
      if (!snapshot) {
        setError({
          kind: 'network_failure',
          message: 'Unable to verify current auction state. Check your connection and try again.',
          canRetry: true,
          transactionPossible: true,
          isAmbiguous: true });
        setStage('entry');
        return;
      }

      // Re-validate after refresh using the returned snapshot values
      const result = validateBidEntry(bidInput, currencyCode, fxRates, {
        minimumNextBidGbp: snapshot.minimumNextBidGbp,
        isSeller: auction.isSeller,
        effectiveState: snapshot.effectiveState,
        isSubmitting });
      if (!result.valid || !result.gbpAmount) {
        setError(result.error);
        setStage('entry');
        return;
      }
      validatedGbpAmount = result.gbpAmount;
      setGbpAmount(validatedGbpAmount);

      // Re-validate optional proxy max bid against the refreshed snapshot
      if (proxyEnabled) {
        const maxResult = validateMaxBid(maxBidInput, validatedGbpAmount, snapshot.minimumNextBidGbp);
        if (maxResult.error) {
          setError(maxResult.error);
          setStage('entry');
          return;
        }
        validatedMaxBidGbp = maxResult.gbp;
        setMaxBidGbp(validatedMaxBidGbp);
      } else {
        setMaxBidGbp(null);
      }
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
      await onSubmitBid(
        validatedGbpAmount,
        idempotencyKeyRef.current,
        proxyEnabled && validatedMaxBidGbp != null ? validatedMaxBidGbp : undefined,
      );
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
        currencyCode,
        fxRates,
      );
      setError(txError);
      haptics.error();

      if (txError.isAmbiguous) {
        // Ambiguous failure — the server may have committed the bid.
        // Instead of showing a generic error, poll the lookup endpoint
        // to resolve the outcome automatically. The idempotency key is
        // preserved so a manual retry (if reconciliation fails) won't
        // create a duplicate.
        setStage('unknown_outcome');
        const key = idempotencyKeyRef.current;
        if (!key) {
          setStage('error');
          return;
        }
        const result = await reconcile<MarketAuctionBid>({
          lookup: () => lookupAuctionBidByIdempotencyKey(key),
          onAcknowledged: () => {
            // Bid was committed — treat as success.
            setStage('success');
            haptics.success();
            // Refresh detail so the auction reflects the new bid.
            void onRefreshDetail();
          },
          onSafeToRetry: () => {
            // No bid was committed — safe to retry with a new key.
            idempotencyKeyRef.current = null;
            setError(null);
            setStage('review');
          },
          onUnresolved: () => {
            // Could not determine — show the ambiguous error with retry.
            setError(txError);
            setStage('error');
          },
          shouldContinue: () => isMountedRef.current && visible });
        if (result.outcome === 'acknowledged' || result.outcome === 'safe_to_retry') {
          return;
        }
        // 'unresolved' falls through to the error stage set by onUnresolved.
        return;
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
                <Text style={styles.bidContextValue}>{formatFromFiat(auction.currentBidGbp, 'GBP')}</Text>
              </View>
              <View style={styles.bidContextRow}>
                <Text style={styles.bidContextLabel}>Minimum to lead</Text>
                <Text style={styles.bidContextValue}>{formatFromFiat(currentMinimum, 'GBP')}</Text>
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
              {formatIzeAmount(toIze(Number(bidInput) || 0, currencyCode, fxRates), 2)}
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

            {/* Proxy bidding toggle — restrained switch, no card chrome */}
            <View style={styles.proxyToggleRow}>
              <Text style={styles.proxyToggleLabel}>Set maximum bid</Text>
              <Switch
                value={proxyEnabled}
                onValueChange={(v) => {
                  haptics.selection();
                  setProxyEnabled(v);
                  setError(null);
                  if (!v) setMaxBidInput('');
                }}
                disabled={isPreflighting || isSubmitting}
                trackColor={{ false: themed.border, true: themed.brand }}
                ios_backgroundColor={themed.border}
                accessibilityLabel="Enable proxy bidding with a maximum bid"
                accessibilityRole="switch"
              />
            </View>

            {/* Max bid input — same styling as the bid input, inline below */}
            {proxyEnabled && (
              <>
                <View style={styles.amountContainer}>
                  <Text style={styles.amountCurrency}>{currencyCode}</Text>
                  <AppInput
                    value={maxBidInput}
                    onChangeText={handleMaxBidChange}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    accessibilityLabel="Maximum bid amount"
                    accessibilityHint={`Enter your maximum bid in ${currencyCode}`}
                    containerStyle={styles.amountInput}
                  />
                </View>
                <Text style={styles.amountIzeEquivalent}>
                  {formatIzeAmount(toIze(Number(maxBidInput) || 0, currencyCode, fxRates), 2)}
                </Text>
              </>
            )}

            {/* Bid confidence indicator — shows if the current amount would lead */}
            {(() => {
              const bidGbp = gbpAmount ?? 0;
              const wouldLead = bidGbp >= currentMinimum && bidGbp > 0;
              if (bidGbp <= 0) return null;
              return (
                <View style={[styles.confidenceRow, { backgroundColor: wouldLead ? themed.successSubtle : themed.dangerSubtle }]}>
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
              title={isPreflighting ? 'Checking...' : proxyEnabled ? 'Review proxy bid' : 'Review bid'}
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
                {formatIzeAmount(gbpAmount ? toIze(gbpAmount, 'GBP', fxRates) : 0, 2)}
              </Text>
              {isNonGbp && gbpEquivalentText && (
                <Text style={styles.reviewGbpEquivalent}>{gbpEquivalentText}</Text>
              )}
            </View>

            {/* Receipt details */}
            <View style={styles.reviewReceipt}>
              <View style={styles.reviewReceiptRow}>
                <Text style={styles.reviewReceiptLabel}>Current value</Text>
                <Text style={styles.reviewReceiptValue}>{formatFromFiat(auction.currentBidGbp, 'GBP')}</Text>
              </View>
              <View style={styles.reviewReceiptRow}>
                <Text style={styles.reviewReceiptLabel}>Minimum to lead</Text>
                <Text style={styles.reviewReceiptValue}>{formatFromFiat(currentMinimum, 'GBP')}</Text>
              </View>
              {proxyEnabled && maxBidGbp != null && (
                <View style={styles.reviewReceiptRow}>
                  <Text style={styles.reviewReceiptLabel}>Maximum bid</Text>
                  <Text style={styles.reviewReceiptValue}>{formatFromFiat(maxBidGbp, 'GBP')}</Text>
                </View>
              )}
              <View style={styles.reviewReceiptRow}>
                <Text style={styles.reviewReceiptLabel}>Time remaining</Text>
                <Text style={styles.reviewReceiptValue}>{auction.countdownText}</Text>
              </View>
              <View style={styles.reviewReceiptRow}>
                <Text style={styles.reviewReceiptLabel}>Seller</Text>
                <Text style={styles.reviewReceiptValue}>{auction.sellerName}</Text>
              </View>
            </View>

            {/* P0: Risk disclosure — binding bid, payment deadline, no
                retraction. Presented above the confirm button, not buried
                in fine print. The user must acknowledge these terms before
                committing to an irreversible action. */}
            <View style={styles.commitmentBlock}>
              <View style={styles.commitmentRow}>
                <Ionicons name="information-circle-outline" size={14} color={themed.textSecondary} />
                <Text style={styles.commitmentText}>
                  Bids are binding once accepted.
                </Text>
              </View>
              <View style={styles.commitmentRow}>
                <Ionicons name="time-outline" size={14} color={themed.textSecondary} />
                <Text style={styles.commitmentText}>
                  If you win, payment is due promptly after the auction ends.
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
              title={isPreflighting ? 'Checking...' : proxyEnabled ? 'Place proxy bid' : 'Confirm bid'}
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

        {/* ── Unknown outcome stage ── */}
        {/* The bid response was lost. We are polling the backend to
            determine whether the bid was committed. The user must not
            retry until the status is resolved. */}
        {stage === 'unknown_outcome' && (
          <View style={styles.centerStage}>
            <View style={styles.submittingSpinnerWrap}>
              <ActivityIndicator size="large" color={themed.brand} />
            </View>
            <Text style={styles.submittingText}>Checking your bid...</Text>
            <Text style={styles.submittingDetail}>
              We lost connection while placing your bid. We are checking
              whether it went through. Please do not place another bid.
            </Text>
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
              Your bid of {formatFromFiat(gbpAmount ?? 0, 'GBP')} has been submitted
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
                  {formatFromFiat(error.buyNowPriceGbp, 'GBP')}
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
  danger: string; dangerSubtle: string; success: string; successSubtle: string;
  warning: string; background: string; textInverse: string;
}) => StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.md },
  itemThumbContainer: {
    width: 44,
    height: 44,
    borderRadius: Radius.md },
  itemThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: themed.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  itemHeaderText: {
    flex: 1 },
  itemTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: themed.textPrimary },
  itemSeller: {
    fontSize: TypographyV2.meta.size,
    color: themed.textSecondary,
    marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: themed.border,
    marginBottom: Space.sm },
  stageContent: {
    gap: Space.sm },
  // ── Entry stage — large centered amount ──
  entryHeading: {
    fontSize: TypographyV2.meta.size,
    color: themed.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: Space.xs },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md },
  amountCurrency: {
    fontSize: TypographyV2.priceList.size,
    color: themed.textMuted,
    fontFamily: TypographyV2.priceList.fontFamily },
  amountInput: {
    flex: 1 },
  amountIzeEquivalent: {
    fontSize: TypographyV2.meta.size,
    color: themed.brand,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center',
    marginBottom: Space.sm,
    fontVariant: ['tabular-nums'] },
  bidContextStack: {
    gap: Space.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themed.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themed.border,
    paddingVertical: Space.sm },
  bidContextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  bidContextLabel: {
    fontSize: TypographyV2.meta.size - 2,
    color: themed.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.5,
    textTransform: 'uppercase' },
  bidContextValue: {
    fontSize: TypographyV2.bodyStrong.size,
    color: themed.textPrimary,
    fontFamily: TypographyV2.priceList.fontFamily,
    fontVariant: ['tabular-nums'],
    textAlign: 'right' },
  bidContextValueSecondary: {
    fontSize: TypographyV2.body.size,
    color: themed.textSecondary,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    textAlign: 'right' },
  dominantAction: {
    width: '100%',
    marginTop: Space.xs },
  dismissLink: {
    alignItems: 'center',
    paddingVertical: Space.sm,
    marginTop: Space.xs },
  dismissLinkText: {
    fontSize: TypographyV2.body.size,
    color: themed.textMuted,
    fontFamily: TypographyV2.body.fontFamily },
  // ── Review stage — receipt ──
  reviewHeading: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: themed.textMuted,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: Space.sm,
    textTransform: 'uppercase' },
  reviewAmountBlock: {
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: Space.xs },
  reviewAmountValue: {
    fontSize: TypographyV2.display.size + 4,
    lineHeight: TypographyV2.display.lineHeight + 4,
    fontWeight: '700',
    letterSpacing: TypographyV2.display.letterSpacing,
    color: themed.textPrimary,
    fontFamily: TypographyV2.display.fontFamily,
    fontVariant: ['tabular-nums'] },
  reviewAmountIze: {
    fontSize: TypographyV2.body.size,
    color: themed.brand,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'] },
  reviewGbpEquivalent: {
    fontSize: TypographyV2.meta.size,
    color: themed.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  reviewReceipt: {
    gap: Space.xs + 2,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themed.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themed.border },
  reviewReceiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  reviewReceiptLabel: {
    fontSize: TypographyV2.meta.size - 2,
    color: themed.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.5 },
  reviewReceiptValue: {
    fontSize: TypographyV2.body.size,
    color: themed.textPrimary,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    textAlign: 'right' },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs },
  izeEquivalentText: {
    fontSize: TypographyV2.meta.size,
    color: themed.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs },
  countdownText: {
    fontSize: TypographyV2.meta.size,
    color: themed.textSecondary,
    fontFamily: TypographyV2.meta.fontFamily },
  input: {
    marginBottom: Space.xs },
  incrementRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.sm },
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
    justifyContent: 'center' },
  incrementChipPressed: {
    backgroundColor: themed.border,
    opacity: 0.85 },
  incrementText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: themed.textPrimary },
  proxyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs },
  proxyToggleLabel: {
    fontSize: TypographyV2.body.size,
    color: themed.textPrimary,
    fontFamily: TypographyV2.body.fontFamily },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginBottom: Space.sm },
  confidenceText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: themed.dangerSubtle,
    marginBottom: Space.sm },
  errorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    color: themed.danger,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: 18 },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs },
  actionBtn: {
    flex: 1 },
  primaryBtn: {},
  reviewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: themed.border,
    marginVertical: Space.xs },
  commitmentBlock: {
    gap: Space.xs / 2,
    paddingVertical: Space.xs },
  commitmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs / 2 },
  commitmentText: {
    fontSize: TypographyV2.meta.size,
    color: themed.textSecondary,
    fontFamily: TypographyV2.meta.fontFamily },
  centerStage: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.md },
  submittingText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: themed.textPrimary },
  submittingSpinnerWrap: {
    marginBottom: Space.xs },
  submittingDetail: {
    fontSize: TypographyV2.meta.size,
    color: themed.textMuted,
    fontFamily: TypographyV2.meta.fontFamily },
  successIcon: {
    marginBottom: Space.xs },
  successTitle: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    color: themed.textPrimary },
  successDetail: {
    fontSize: TypographyV2.body.size,
    color: themed.textSecondary,
    fontFamily: TypographyV2.body.fontFamily },
  doneBtn: {
    minWidth: 160,
    marginTop: Space.sm },
  errorIcon: {
    marginBottom: Space.xs },
  errorIconSmall: {
    marginBottom: Space.xs },
  errorTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: themed.textPrimary,
    textAlign: 'center',
    paddingHorizontal: Space.md },
  conflictIconRow: {
    alignItems: 'center',
    marginBottom: Space.xs },
  conflictHeading: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    color: themed.textPrimary,
    textAlign: 'center',
    marginBottom: Space.xs },
  conflictExplanation: {
    fontSize: TypographyV2.bodyStrong.size,
    color: themed.textSecondary,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    textAlign: 'center',
    paddingHorizontal: Space.sm,
    marginBottom: Space.md },
  conflictPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    backgroundColor: themed.surfaceAlt,
    borderRadius: Radius.md,
    marginBottom: Space.md },
  conflictPriceLabel: {
    fontSize: TypographyV2.body.size,
    color: themed.textSecondary },
  conflictPriceValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: themed.textPrimary } });

