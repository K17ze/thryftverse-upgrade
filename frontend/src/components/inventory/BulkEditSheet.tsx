import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { AppSegmentControl } from '../ui/AppSegmentControl';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { ListingApiItem } from '../../services/listingsApi';
import type {
  SellerHubBatchItem,
  SellerHubBatchResponse,
  SellerHubListingEditPatch,
} from '../../services/sellerHubApi';

export interface BulkEditSheetProps {
  visible: boolean;
  /** The selected listings the edit applies to. */
  listings: ListingApiItem[];
  submitting: boolean;
  /**
   * Submit the built per-item patches. Resolves to the batch response, or
   * null on a transport failure (the hook already surfaces the toast).
   */
  onSubmit: (items: SellerHubBatchItem[]) => Promise<SellerHubBatchResponse | null>;
  onDismiss: () => void;
}

type PriceMode = 'none' | 'set' | 'increase' | 'decrease';
type ShippingMethodChoice = 'none' | 'standard' | 'express';
type ShippingPayerChoice = 'none' | 'buyer' | 'seller';

/** A selected listing that cannot take the requested change — reported
 *  truthfully instead of being sent a patch the server would reject. */
interface SkippedItem {
  listingId: string;
  title: string;
  reason: string;
}

const PRICE_MODE_OPTIONS = [
  { value: 'none' as const, label: 'No change' },
  { value: 'set' as const, label: 'Set' },
  { value: 'increase' as const, label: '+%' },
  { value: 'decrease' as const, label: '−%' },
];

const ORIGINAL_PRICE_OPTIONS = [
  { value: 'none' as const, label: 'No change' },
  { value: 'set' as const, label: 'Set' },
];

const SHIPPING_METHOD_OPTIONS = [
  { value: 'none' as const, label: 'No change' },
  { value: 'standard' as const, label: 'Standard' },
  { value: 'express' as const, label: 'Express' },
];

const SHIPPING_PAYER_OPTIONS = [
  { value: 'none' as const, label: 'No change' },
  { value: 'buyer' as const, label: 'Buyer' },
  { value: 'seller' as const, label: 'Seller' },
];

/** Map a backend rejection reason onto a short human-readable phrase. */
function describeReason(reason: string | undefined): string {
  switch (reason) {
    case 'not_found':
      return 'Listing no longer exists';
    case 'forbidden':
      return 'Not your listing';
    case 'invalid_patch':
      return 'Value failed validation';
    case 'empty_patch':
      return 'Nothing to change';
    case 'server_error':
      return 'Server error — retry';
    default:
      return reason ?? 'Unknown error';
  }
}

function parseMoney(value: string): number | null {
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parsePercent(value: string, allowFull: boolean): number | null {
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  if (!allowFull && n > 100) return null;
  return n;
}

/**
 * BulkEditSheet — field-level edit across the selected listings.
 *
 * Only fields the seller explicitly changes are sent; each listing gets its
 * own patch so a percent adjustment is computed against that listing's
 * current price. The server validates every patch against the same
 * whitelist as PATCH /listings/:id and returns a per-item receipt — a
 * partial result is rendered truthfully here instead of pretending the
 * whole batch succeeded.
 */
export function BulkEditSheet({
  visible,
  listings,
  submitting,
  onSubmit,
  onDismiss,
}: BulkEditSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  const [priceMode, setPriceMode] = useState<PriceMode>('none');
  const [priceValue, setPriceValue] = useState('');
  const [originalPriceMode, setOriginalPriceMode] = useState<'none' | 'set'>('none');
  const [originalPriceValue, setOriginalPriceValue] = useState('');
  const [shippingMethod, setShippingMethod] = useState<ShippingMethodChoice>('none');
  const [shippingPayer, setShippingPayer] = useState<ShippingPayerChoice>('none');
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<SellerHubBatchResponse | null>(null);
  // Row context captured at submit time — the result view outlives the
  // selection (the hook exits selection mode on success), so titles and
  // client-side skips must not be read from live props.
  const [resultContext, setResultContext] = useState<{
    titles: Map<string, string>;
    skipped: SkippedItem[];
  } | null>(null);

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setPriceMode('none');
      setPriceValue('');
      setOriginalPriceMode('none');
      setOriginalPriceValue('');
      setShippingMethod('none');
      setShippingPayer('none');
      setFormError(null);
      setResult(null);
      setResultContext(null);
    }
  }, [visible]);

  const count = listings.length;
  const single = count === 1 ? listings[0] : null;

  const priceHelper = useMemo(() => {
    if (priceMode === 'set') return `Sets every selected listing to this price.`;
    if (priceMode === 'increase' || priceMode === 'decrease') {
      const pct = parsePercent(priceValue, true);
      if (single && pct !== null && Number.isFinite(single.priceGbp)) {
        const factor = priceMode === 'increase' ? 1 + pct / 100 : 1 - pct / 100;
        const next = Math.max(0, Math.round(single.priceGbp * factor * 100) / 100);
        return `${formatFromFiat(single.priceGbp, 'GBP')} → ${formatFromFiat(next, 'GBP')}`;
      }
      return `Applied to each listing's current price.`;
    }
    return undefined;
  }, [priceMode, priceValue, single, formatFromFiat]);

  /** Build the per-item patches. Returns null when the form is invalid or
   *  no field is being changed; otherwise the submittable items plus the
   *  listings that had to be skipped (with the truthful reason). */
  const buildItems = (): { items: SellerHubBatchItem[]; skipped: SkippedItem[] } | null => {
    const shared: SellerHubListingEditPatch = {};
    if (originalPriceMode === 'set') {
      const v = parseMoney(originalPriceValue);
      if (v === null) return null;
      shared.originalPriceGbp = v;
    }
    if (shippingMethod !== 'none') shared.shippingMethod = shippingMethod;
    if (shippingPayer !== 'none') shared.shippingPayer = shippingPayer;

    let priceFn: ((current: number) => number) | null = null;
    let priceSet: number | null = null;
    if (priceMode === 'set') {
      priceSet = parseMoney(priceValue);
      if (priceSet === null) return null;
    } else if (priceMode === 'increase' || priceMode === 'decrease') {
      const pct = parsePercent(priceValue, priceMode === 'increase');
      if (pct === null) return null;
      const factor = priceMode === 'increase' ? 1 + pct / 100 : 1 - pct / 100;
      priceFn = (current) => Math.max(0, Math.round(current * factor * 100) / 100);
    }

    if (!priceFn && priceSet === null && Object.keys(shared).length === 0) {
      return null;
    }

    const items: SellerHubBatchItem[] = [];
    const skipped: SkippedItem[] = [];
    for (const l of listings) {
      const patch: SellerHubListingEditPatch = { ...shared };
      if (priceSet !== null) {
        patch.priceGbp = priceSet;
      } else if (priceFn) {
        if (!Number.isFinite(l.priceGbp)) {
          // A percent adjustment on a non-finite price would produce NaN —
          // the server rejects it as invalid_patch. Skip the item and say
          // why instead of letting it fail inside the batch.
          skipped.push({ listingId: l.id, title: l.title, reason: 'Current price unavailable' });
          continue;
        }
        patch.priceGbp = priceFn(l.priceGbp);
      }
      if (Object.keys(patch).length === 0) {
        skipped.push({ listingId: l.id, title: l.title, reason: 'Nothing to change' });
        continue;
      }
      items.push({ listingId: l.id, patch });
    }
    return { items, skipped };
  };

  // Eager build so listings that will be skipped (e.g. a percent change on
  // a listing with a non-finite price) are visible BEFORE the seller taps
  // Apply — not discovered inside a server receipt.
  const built = useMemo(
    () => buildItems(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listings, priceMode, priceValue, originalPriceMode, originalPriceValue, shippingMethod, shippingPayer],
  );

  const canSubmit =
    !submitting &&
    (priceMode !== 'none' ||
      originalPriceMode !== 'none' ||
      shippingMethod !== 'none' ||
      shippingPayer !== 'none') &&
    count > 0;

  const handleApply = async () => {
    const builtNow = buildItems();
    if (!builtNow) {
      setFormError('Check the values you entered — prices must be valid amounts.');
      return;
    }
    if (builtNow.items.length === 0) {
      setFormError('Nothing to apply — every selected listing was skipped.');
      return;
    }
    setFormError(null);
    const response = await onSubmit(builtNow.items);
    // null → transport failure (toast already shown); keep the form open.
    if (!response) return;
    // Snapshot the row context BEFORE the hook clears the selection — the
    // result view renders titles and skips from this, not the live props.
    setResultContext({ titles: new Map(titleById), skipped: builtNow.skipped });
    if (response.state === 'complete' && builtNow.skipped.length === 0) {
      // Clean apply — nothing to report; close like before.
      onDismiss();
      return;
    }
    // Partial failure OR client-side skips: a first-class truthful result —
    // show which items failed/were skipped and why, don't close on a toast.
    setResult(response);
  };

  const failedResults = useMemo(
    () => (result ? result.results.filter((r) => r.state !== 'applied') : []),
    [result],
  );
  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of listings) map.set(l.id, l.title);
    return map;
  }, [listings]);

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      variant="form"
      snapPoint={0.72}
    >
      <View style={styles.container}>
        {result ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {result.appliedCount} updated
              {failedResults.length > 0 ? ` · ${failedResults.length} failed` : ''}
              {(resultContext?.skipped.length ?? 0) > 0 ? ` · ${resultContext!.skipped.length} skipped` : ''}
            </Text>
            {failedResults.map((r) => (
              <View key={r.listingId} style={styles.resultRow}>
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {resultContext?.titles.get(r.listingId) ?? titleById.get(r.listingId) ?? r.listingId}
                </Text>
                <Text style={styles.resultReason}>{describeReason(r.reason)}</Text>
              </View>
            ))}
            {(resultContext?.skipped ?? []).map((s) => (
              <View key={`skipped-${s.listingId}`} style={styles.resultRow}>
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={[styles.resultReason, { color: colors.warningText }]}>
                  Skipped — {s.reason}
                </Text>
              </View>
            ))}
            <View style={styles.footer}>
              <AppButton
                title="Done"
                onPress={onDismiss}
                variant="primary"
                size="lg"
                accessibilityLabel="Close edit results"
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Edit {count} listing{count === 1 ? '' : 's'}
            </Text>
            <Text style={styles.subtitle}>
              Only the fields you change are applied.
            </Text>

            {/* ── Price ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Price</Text>
              <AppSegmentControl
                options={PRICE_MODE_OPTIONS}
                value={priceMode}
                onChange={setPriceMode}
                fullWidth
              />
              {priceMode !== 'none' ? (
                <AppInput
                  label={priceMode === 'set' ? 'New price (£)' : 'Percent (%)'}
                  value={priceValue}
                  onChangeText={setPriceValue}
                  keyboardType="decimal-pad"
                  placeholder={priceMode === 'set' ? '0.00' : 'e.g. 10'}
                  helperText={priceHelper}
                  containerStyle={styles.input}
                />
              ) : null}
            </View>

            {/* ── Compare-at price ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Compare-at price</Text>
              <AppSegmentControl
                options={ORIGINAL_PRICE_OPTIONS}
                value={originalPriceMode}
                onChange={setOriginalPriceMode}
                fullWidth
              />
              {originalPriceMode === 'set' ? (
                <AppInput
                  label="Original price (£)"
                  value={originalPriceValue}
                  onChangeText={setOriginalPriceValue}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  helperText="Shown crossed out next to the sale price."
                  containerStyle={styles.input}
                />
              ) : null}
            </View>

            {/* ── Shipping ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Shipping method</Text>
              <AppSegmentControl
                options={SHIPPING_METHOD_OPTIONS}
                value={shippingMethod}
                onChange={setShippingMethod}
                fullWidth
              />
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
                Shipping paid by
              </Text>
              <AppSegmentControl
                options={SHIPPING_PAYER_OPTIONS}
                value={shippingPayer}
                onChange={setShippingPayer}
                fullWidth
              />
            </View>

            {/* Skipped rows are surfaced before Apply so a listing that
                cannot take the change is never silently omitted. */}
            {built && built.skipped.length > 0 ? (
              <View style={styles.skippedBlock}>
                {built.skipped.map((s) => (
                  <View key={`preview-${s.listingId}`} style={styles.resultRow}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{s.title}</Text>
                    <Text style={[styles.resultReason, { color: colors.warningText }]}>
                      Skipped — {s.reason}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

            <View style={styles.footer}>
              <AppButton
                title={`Apply to ${count} listing${count === 1 ? '' : 's'}`}
                onPress={() => void handleApply()}
                variant="primary"
                size="lg"
                loading={submitting}
                disabled={!canSubmit}
                accessibilityLabel={`Apply changes to ${count} listings`}
              />
              <AppButton
                title="Cancel"
                onPress={onDismiss}
                variant="ghost"
                size="md"
                accessibilityLabel="Cancel bulk edit"
              />
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
    sectionLabelSpaced: {
      marginTop: Space.sm },
    input: {
      marginTop: Space.sm },
    errorText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.dangerText,
      marginTop: Space.xs },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    resultTitle: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    resultReason: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.dangerText },
    skippedBlock: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: Space.xs },
    footer: {
      marginTop: 'auto',
      paddingTop: Space.md,
      gap: Space.sm } });
