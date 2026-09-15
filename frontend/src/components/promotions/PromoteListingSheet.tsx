import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { AppSegmentControl } from '../ui/AppSegmentControl';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useStore } from '../../store/useStore';
import { parseApiError } from '../../lib/apiClient';
import { getSellerWalletBalances } from '../../services/walletApi';
import type { ListingApiItem } from '../../services/listingsApi';
import {
  createListingPromotion,
  PROMOTION_MAX_DAILY_BUDGET_MINOR,
  PROMOTION_MIN_DAILY_BUDGET_MINOR,
  type PromotionDurationDays,
  type SellerPromotion,
} from '../../services/promotionsApi';
import { createStableId } from '../../utils/createStableId';

const DURATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

/** Server-stamped ISO date → "12 Mar"; falls back to the raw string. */
function formatDay(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export interface PromoteListingSheetProps {
  visible: boolean;
  /** The listing being promoted (must be the seller's own active listing). */
  listing: ListingApiItem | null;
  /**
   * The listing's live promotion, when one exists. Passed by the host (from
   * the seller-promotions map) so the sheet renders a manage state instead
   * of dead-ending into a 409 PROMOTION_ALREADY_ACTIVE.
   */
  existingPromotion?: SellerPromotion | null;
  /** Called after a promotion is successfully created (or replayed). */
  onCreated?: () => void;
  /** Opens the seller promotions management surface. */
  onManagePromotions?: () => void;
  /** Opens the wallet so the seller can top up before promoting. */
  onOpenWallet?: () => void;
  onDismiss: () => void;
}

/**
 * PromoteListingSheet — flat-fee promoted placement for a seller's listing.
 *
 * Truthful copy (AGENTS.md §11): the sheet tells the seller exactly what the
 * money buys — a labelled "Sponsored" slot in discovery, charged daily from
 * their balance. It never promises a ranking boost or fabricated reach.
 * The submit carries a client idempotency key so a retried tap can never
 * double-charge.
 */
export function PromoteListingSheet({
  visible,
  listing,
  existingPromotion,
  onCreated,
  onManagePromotions,
  onOpenWallet,
  onDismiss,
}: PromoteListingSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((s) => s.currentUser);

  const [budgetText, setBudgetText] = useState('5');
  const [duration, setDuration] = useState<string>('7');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  // The promotion row returned by create — carries the real endsAt so the
  // success copy states the true end date, never a recomputed guess.
  const [createdPromotion, setCreatedPromotion] = useState<SellerPromotion | null>(null);
  // Spendable seller_payable balance in pence — the same projection the
  // server's charge gate reads. `null` = not loaded / fetch failed, in
  // which case the form stays submittable and the 402 gate speaks.
  const [balanceMinor, setBalanceMinor] = useState<number | null>(null);
  // One key per sheet-open so a double-tap/retry replays, never duplicates.
  const [idempotencyKey, setIdempotencyKey] = useState(() => createStableId('promotion'));

  useEffect(() => {
    if (!visible) return;
    setBudgetText('5');
    setDuration('7');
    setSubmitting(false);
    setFormError(null);
    setSucceeded(false);
    setCreatedPromotion(null);
    setBalanceMinor(null);
    setIdempotencyKey(createStableId('promotion'));

    // Pre-check the payable balance so an unaffordable budget is disabled
    // with truthful copy instead of failing with a 402 after submit.
    let cancelled = false;
    const uid = currentUser?.id;
    if (uid) {
      getSellerWalletBalances(uid)
        .then((res) => {
          // A partial wallet payload must not poison the affordability
          // gate with NaN — leave the balance unknown instead.
          if (!cancelled && Number.isFinite(res.balances.availableGbp)) {
            setBalanceMinor(Math.round(res.balances.availableGbp * 100));
          }
        })
        .catch(() => {
          // Balance unknown — leave it unset; the server remains the gate.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [visible, currentUser?.id]);

  const dailyBudgetMinor = useMemo(() => {
    const n = Number(budgetText.trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }, [budgetText]);

  const durationDays = Number(duration) as PromotionDurationDays;

  const budgetError = useMemo(() => {
    if (budgetText.trim().length === 0) return 'Enter a daily budget.';
    if (dailyBudgetMinor === null) return 'Enter a valid amount in pounds.';
    if (dailyBudgetMinor < PROMOTION_MIN_DAILY_BUDGET_MINOR) {
      return `Minimum ${formatFromFiat(PROMOTION_MIN_DAILY_BUDGET_MINOR / 100, 'GBP')} per day.`;
    }
    if (dailyBudgetMinor > PROMOTION_MAX_DAILY_BUDGET_MINOR) {
      return `Maximum ${formatFromFiat(PROMOTION_MAX_DAILY_BUDGET_MINOR / 100, 'GBP')} per day.`;
    }
    return null;
  }, [budgetText, dailyBudgetMinor, formatFromFiat]);

  const totalLabel =
    dailyBudgetMinor !== null && !budgetError
      ? formatFromFiat((dailyBudgetMinor * durationDays) / 100, 'GBP')
      : null;
  const dailyLabel =
    dailyBudgetMinor !== null && !budgetError
      ? formatFromFiat(dailyBudgetMinor / 100, 'GBP')
      : null;

  // Balance gate — only blocks when the balance is actually known and too
  // low; an unknown balance never disables submit (server stays the gate).
  const insufficientBalance =
    balanceMinor !== null && dailyBudgetMinor !== null && dailyBudgetMinor > balanceMinor;

  const canSubmit =
    Boolean(listing) &&
    !submitting &&
    dailyBudgetMinor !== null &&
    !budgetError &&
    !insufficientBalance;

  // Live promotion for this listing → manage state instead of a create
  // form that would dead-end on a 409.
  const livePromotion =
    existingPromotion && existingPromotion.status !== 'ended' ? existingPromotion : null;

  const handleSubmit = async () => {
    if (!listing || dailyBudgetMinor === null || budgetError || insufficientBalance) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await createListingPromotion({
        listingId: listing.id,
        dailyBudgetMinor,
        durationDays,
        idempotencyKey,
      });
      setCreatedPromotion(result.promotion ?? null);
      setSucceeded(true);
      onCreated?.();
    } catch (error) {
      const parsed = parseApiError(error, 'Could not start the promotion.');
      setFormError(parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  const listingAnchor = listing ? (
    <View style={styles.listingRow}>
      {listing.images[0] ? (
        <CachedImage
          uri={listing.images[0]}
          style={styles.listingThumb}
          containerStyle={styles.listingThumbWrap}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.listingThumbWrap, styles.listingThumbFallback]}>
          <AppIcon name="image" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
        </View>
      )}
      <View style={styles.listingRowBody}>
        <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
        {Number.isFinite(listing.priceGbp) ? (
          <Text style={styles.listingPrice}>{formatFromFiat(listing.priceGbp, 'GBP')}</Text>
        ) : null}
      </View>
    </View>
  ) : null;

  const livePromotionCopy = livePromotion
    ? livePromotion.status === 'active'
      ? `This listing is already in labelled Sponsored slots at ${formatFromFiat(livePromotion.dailyBudgetGbp, 'GBP')}/day.`
      : livePromotion.status === 'exhausted'
        ? `This listing's promotion stopped — your balance couldn't cover the daily fee. Resume it from Promotions once topped up.`
        : `This listing's promotion is paused at ${formatFromFiat(livePromotion.dailyBudgetGbp, 'GBP')}/day. Nothing is charged while it's paused.`
    : null;

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} variant="form" snapPoint={0.6}>
      <View style={styles.container}>
        {succeeded ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Promotion active
            </Text>
            {listingAnchor}
            <Text style={styles.subtitle}>
              {listing?.title ?? 'This listing'} now appears in labelled Sponsored
              slots in discovery. {dailyLabel ?? 'The daily fee'} is charged once
              per active day from your balance.
              {createdPromotion?.endsAt
                ? ` Runs until ${formatDay(createdPromotion.endsAt)}.`
                : ''}
            </Text>
            <View style={styles.footer}>
              <AppButton
                title="Done"
                onPress={onDismiss}
                variant="primary"
                size="lg"
                accessibilityLabel="Close promotion confirmation"
              />
              {onManagePromotions ? (
                <AppButton
                  title="Manage promotions"
                  onPress={onManagePromotions}
                  variant="ghost"
                  size="md"
                  accessibilityLabel="Open promotions management"
                />
              ) : null}
            </View>
          </>
        ) : livePromotion ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {livePromotion.status === 'active' ? 'Already sponsored' : 'Promotion paused'}
            </Text>
            {listingAnchor}
            <Text style={styles.subtitle}>{livePromotionCopy}</Text>
            <View style={styles.footer}>
              <AppButton
                title="Manage promotions"
                onPress={onManagePromotions ?? onDismiss}
                variant="primary"
                size="lg"
                accessibilityLabel="Open promotions management"
              />
              <AppButton
                title="Close"
                onPress={onDismiss}
                variant="ghost"
                size="md"
                accessibilityLabel="Close"
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Promote listing
            </Text>
            {listingAnchor}
            <Text style={styles.subtitle}>
              Your listing gets a labelled Sponsored slot in discovery. Charged
              daily from your balance.
            </Text>

            {balanceMinor !== null ? (
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Available balance</Text>
                <Text
                  style={[
                    styles.balanceValue,
                    insufficientBalance ? { color: colors.danger } : null,
                  ]}
                >
                  {formatFromFiat(balanceMinor / 100, 'GBP')}
                </Text>
              </View>
            ) : null}
            {insufficientBalance && dailyLabel ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                Not enough to cover {dailyLabel}/day — top up your balance first.
              </Text>
            ) : null}

            <View style={styles.section}>
              <AppInput
                label="Daily budget"
                value={budgetText}
                onChangeText={(text) => {
                  setBudgetText(text);
                  setFormError(null);
                }}
                keyboardType="decimal-pad"
                appearance="filled"
                prefix={<Text style={styles.currencyPrefix}>£</Text>}
                errorText={budgetText.trim().length > 0 ? budgetError ?? undefined : undefined}
                helperText={
                  budgetError === null
                    ? `£1–£500 per day${totalLabel ? ` · up to ${totalLabel} total` : ''}`
                    : undefined
                }
                accessibilityLabel="Daily budget in pounds"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Duration</Text>
              <AppSegmentControl
                options={DURATION_OPTIONS}
                value={duration}
                onChange={setDuration}
              />
            </View>

            {formError ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {formError}
              </Text>
            ) : null}

            <View style={styles.footer}>
              <AppButton
                title={dailyLabel ? `Promote for ${dailyLabel}/day` : 'Promote listing'}
                onPress={() => void handleSubmit()}
                disabled={!canSubmit}
                loading={submitting}
                variant="primary"
                size="lg"
                accessibilityLabel="Start paid promotion"
                accessibilityHint="Charges the daily fee from your seller balance"
              />
              {insufficientBalance && onOpenWallet ? (
                <AppButton
                  title="Top up in Wallet"
                  onPress={onOpenWallet}
                  variant="ghost"
                  size="md"
                  accessibilityLabel="Open wallet to top up your balance"
                />
              ) : null}
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: Space.xs },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary },
    subtitle: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textSecondary,
      marginTop: Space.xs,
      marginBottom: Space.md },
    // Listing anchor — flat row, hairline below, no card chrome.
    listingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      marginTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    listingThumbWrap: {
      width: Space.xxl,
      height: Space.xxl,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    listingThumb: {
      width: Space.xxl,
      height: Space.xxl },
    listingThumbFallback: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center' },
    listingRowBody: {
      flex: 1,
      gap: Space.xs / 2,
      minWidth: 0 },
    listingTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary },
    listingPrice: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    balanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm },
    balanceLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    balanceValue: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    section: {
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    sectionLabel: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      letterSpacing: TypographyV2.label.letterSpacing,
      color: colors.textSecondary,
      marginBottom: Space.sm },
    currencyPrefix: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary },
    errorText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
      marginTop: Space.xs },
    footer: {
      marginTop: Space.md,
      gap: Space.sm },
  });
