import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  Space,
  Radius,
  Stroke,
  Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  type SmartSellPolicy,
  type NetQuote,
  type SmartSellDecisionRecord,
  computeNetQuote,
  computeGrossForNet,
  enableSmartSell,
  disableSmartSell,
  updateSmartSellPolicy,
  fetchSmartSellDecisions } from '../../services/smartSellApi';

export interface SmartSellCardProps {
  /** Listing id the policy applies to. */
  listingId: string;
  /** Current Smart Sell policy. */
  policy: SmartSellPolicy;
  /** Called whenever the seller edits the policy. */
  onPolicyChange: (policy: SmartSellPolicy) => void;
  /** Optional listing price (GBP) used to seed sensible threshold defaults. */
  listingPrice?: number;
  /** Server policy ID for fetching decision history. Omitted in preview mode. */
  serverPolicyId?: string;
}

/**
 * Smart Sell — compact row that opens a focused configuration sheet.
 *
 * The primary mental model is minimum expected net payout (what the seller
 * receives after fees). Gross thresholds are advanced settings behind
 * disclosure. No fabricated metrics, no trend arrows, no glowing ranges.
 *
 * Per AGENTS.md anti-AI design:
 * - Compact row, not a large nested card in an already long form
 * - Configuration opens a focused sheet, not an inline expansion
 * - One mental model: minimum payout
 * - Full state coverage: preview, disabled, draft, active, paused
 * - No decorative chrome, no celebratory animation
 */
export function SmartSellCard({
  listingId,
  policy,
  onPolicyChange,
  listingPrice,
  serverPolicyId }: SmartSellCardProps) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(), []);

  const [sheetOpen, setSheetOpen] = useState(false);

  const isPreview = policy.capability.kind === 'preview';

  const handleToggle = useCallback(
    (next: boolean) => {
      haptic.light();
      if (next) {
        const updated = enableSmartSell(listingId, listingPrice);
        onPolicyChange(updated);
      } else {
        const updated = disableSmartSell(listingId);
        onPolicyChange(updated);
      }
    },
    [listingId, listingPrice, onPolicyChange, haptic],
  );

  const handleRowPress = useCallback(() => {
    haptic.light();
    setSheetOpen(true);
  }, [haptic]);

  const handlePolicyUpdate = useCallback(
    (patch: Partial<SmartSellPolicy>) => {
      const updated = updateSmartSellPolicy(listingId, patch);
      onPolicyChange(updated);
    },
    [listingId, onPolicyChange],
  );

  // Summary text for the compact row
  const summary = useMemo(() => {
    if (!policy.enabled) return 'Auto-accept offers above your threshold';
    if (policy.minimumNet > 0) {
      return `Min payout ${currencySymbol}${policy.minimumNet.toFixed(2)}`;
    }
    if (policy.acceptGrossThreshold > 0) {
      return `Auto-accept above ${currencySymbol}${policy.acceptGrossThreshold.toFixed(2)}`;
    }
    return 'Configure thresholds';
  }, [policy.enabled, policy.minimumNet, policy.acceptGrossThreshold, currencySymbol]);

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { borderColor: colors.border },
          pressed && { opacity: 0.6 },
        ]}
        onPress={handleRowPress}
        accessibilityRole="button"
        accessibilityLabel="Smart Sell auto-negotiation"
        accessibilityHint="Opens Smart Sell settings"
      >
        <View style={styles.rowLeft}>
          <Ionicons
            name="pricetag-outline"
            size={18}
            color={policy.enabled ? colors.brand : colors.textSecondary}
            aria-hidden={true}
          />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>
              Smart Sell
            </Text>
            <Text
              style={[styles.rowSummary, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {summary}
            </Text>
          </View>
        </View>
        <Switch
          value={policy.enabled}
          onValueChange={handleToggle}
          trackColor={{
            false: colors.surfaceAlt,
            true: colors.brand }}
          thumbColor={colors.scrimTextPrimary}
          accessibilityLabel="Toggle Smart Sell"
          accessibilityHint="Enable or disable auto-negotiation"
        />
      </Pressable>

      {sheetOpen && (
        <SmartSellSheet
          policy={policy}
          onUpdate={handlePolicyUpdate}
          onClose={() => setSheetOpen(false)}
          colors={colors}
          insets={insets}
          reducedMotion={reducedMotion}
          isPreview={isPreview}
          policyId={serverPolicyId}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Configuration sheet — focused, one mental model: minimum payout
// ---------------------------------------------------------------------------

interface SmartSellSheetProps {
  policy: SmartSellPolicy;
  onUpdate: (patch: Partial<SmartSellPolicy>) => void;
  onClose: () => void;
  colors: ThemeColors;
  insets: { bottom: number };
  reducedMotion: boolean;
  isPreview: boolean;
  policyId?: string;
}

function SmartSellSheet({
  policy,
  onUpdate,
  onClose,
  colors,
  insets,
  isPreview,
  policyId }: SmartSellSheetProps) {
  const { currencySymbol } = useFormattedPrice();
  const styles = useMemo(() => createSheetStyles(colors), [colors]);
  const haptic = useHaptic();

  // Local input state so the seller can type freely
  const [minNetText, setMinNetText] = useState(
    policy.minimumNet ? String(policy.minimumNet) : '',
  );
  const [acceptGrossText, setAcceptGrossText] = useState(
    policy.acceptGrossThreshold ? String(policy.acceptGrossThreshold) : '',
  );
  const [declineGrossText, setDeclineGrossText] = useState(
    policy.declineBelowGross ? String(policy.declineBelowGross) : '',
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [decisions, setDecisions] = useState<SmartSellDecisionRecord[]>([]);

  // Fetch decision history when the sheet opens and a policyId is available.
  React.useEffect(() => {
    if (!policyId || !policy.enabled) return;
    let cancelled = false;
    fetchSmartSellDecisions(policyId, 10)
      .then((records) => {
        if (!cancelled) setDecisions(records);
      })
      .catch(() => {
        // Non-fatal — the decision history is supplementary.
      });
    return () => {
      cancelled = true;
    };
  }, [policyId, policy.enabled]);

  // Derived net quote for the current accept threshold
  const acceptQuote: NetQuote | null = useMemo(() => {
    const gross = Number(acceptGrossText) || 0;
    if (gross <= 0) return null;
    return computeNetQuote(gross, policy.feeRate);
  }, [acceptGrossText, policy.feeRate]);

  // When minimum net changes, derive the gross threshold needed
  const handleMinNetChange = useCallback(
    (text: string) => {
      setMinNetText(text);
      const net = Number(text) || 0;
      const gross = computeGrossForNet(net, policy.feeRate);
      setAcceptGrossText(gross > 0 ? String(gross) : '');
      onUpdate({ minimumNet: net, acceptGrossThreshold: gross });
      haptic.light();
    },
    [policy.feeRate, onUpdate, haptic],
  );

  const handleAcceptGrossChange = useCallback(
    (text: string) => {
      setAcceptGrossText(text);
      const gross = Number(text) || 0;
      const quote = computeNetQuote(gross, policy.feeRate);
      setMinNetText(quote.net > 0 ? String(quote.net) : '');
      onUpdate({ acceptGrossThreshold: gross, minimumNet: quote.net });
      haptic.light();
    },
    [policy.feeRate, onUpdate, haptic],
  );

  const handleDeclineGrossChange = useCallback(
    (text: string) => {
      setDeclineGrossText(text);
      const gross = Number(text) || 0;
      onUpdate({ declineBelowGross: gross });
      haptic.light();
    },
    [onUpdate, haptic],
  );

  const handleAutoDeclineToggle = useCallback(
    (next: boolean) => {
      onUpdate({ autoDeclineEnabled: next });
      haptic.light();
    },
    [onUpdate, haptic],
  );

  return (
    <Pressable
      style={styles.overlay}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="Close Smart Sell settings"
      accessibilityHint="Dismiss the sheet and return to the listing"
    >
      <Pressable
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + Space.md,
            borderTopColor: colors.border },
        ]}
        onPress={(e) => e.stopPropagation()}
        accessibilityRole="button"
        accessibilityLabel="Smart Sell settings panel"
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Smart Sell
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Auto-accept offers that meet your minimum payout. Offers between your
          floor and threshold stay manual for you to review.
        </Text>

        {/* Primary input: minimum net payout */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            Minimum payout
          </Text>
          <View
            style={[
              styles.inputWrap,
              { backgroundColor: colors.input, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.inputPrefix, { color: colors.textSecondary }]}>
              {currencySymbol}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={minNetText}
              onChangeText={handleMinNetChange}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel="Minimum payout after fees"
              accessibilityHint="The minimum amount you want to receive after platform fees"
              returnKeyType="done"
            />
          </View>
          <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
            The minimum you receive after fees. Offers that produce at least this
            amount are auto-accepted.
          </Text>
        </View>

        {/* Net proceeds illustration */}
        {acceptQuote && (
          <View
            style={[
              styles.quoteCard,
              { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
            ]}
          >
            <View style={styles.quoteRow}>
              <Text style={[styles.quoteLabel, { color: colors.textSecondary }]}>
                Offer
              </Text>
              <Text
                style={[styles.quoteValue, { color: colors.textPrimary }]}
                accessibilityLabel={`Offer amount ${acceptQuote.gross} pounds`}
                accessibilityHint="The gross offer amount"
              >
                {currencySymbol}{acceptQuote.gross.toFixed(2)}
              </Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={[styles.quoteLabel, { color: colors.textSecondary }]}>
                {`Platform fee (${Math.round(policy.feeRate * 100)}%)`}
              </Text>
              <Text
                style={[styles.quoteValue, { color: colors.danger }]}
                accessibilityLabel={`Platform fee ${acceptQuote.fee} pounds`}
                accessibilityHint="The platform fee deducted"
              >
                −{currencySymbol}{acceptQuote.fee.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.quoteDivider, { backgroundColor: colors.border }]} />
            <View style={styles.quoteRow}>
              <Text style={[styles.quoteNetLabel, { color: colors.textPrimary }]}>
                You receive
              </Text>
              <Text
                style={[styles.quoteNetValue, { color: colors.success }]}
                accessibilityLabel={`You receive ${acceptQuote.net} pounds`}
                accessibilityHint="Your net payout after fees"
              >
                {currencySymbol}{acceptQuote.net.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Advanced settings behind disclosure */}
        <Pressable
          style={({ pressed }) => [
            styles.advancedToggle,
            { borderColor: colors.borderSubtle },
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => {
            haptic.light();
            setShowAdvanced((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel="Toggle advanced settings"
          accessibilityHint="Show or hide advanced threshold settings"
        >
          <Text style={[styles.advancedToggleText, { color: colors.textSecondary }]}>
            Advanced
          </Text>
          <Ionicons
            name={showAdvanced ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
            aria-hidden={true}
          />
        </Pressable>

        {showAdvanced && (
          <View style={styles.advancedPanel}>
            {/* Gross accept threshold */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Auto-accept at (gross)
              </Text>
              <View
                style={[
                  styles.inputWrap,
                  { backgroundColor: colors.input, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[styles.inputPrefix, { color: colors.textSecondary }]}
                >
                  {currencySymbol}
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={acceptGrossText}
                  onChangeText={handleAcceptGrossChange}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Auto-accept gross threshold"
                  accessibilityHint="Accept offers at or above this amount"
                  returnKeyType="done"
                />
              </View>
              <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
                Accept offers at or above this gross amount.
              </Text>
            </View>

            {/* Auto-decline toggle + floor */}
            <View style={styles.autoDeclineRow}>
              <View style={styles.autoDeclineText}>
                <Text
                  style={[styles.fieldLabel, { color: colors.textSecondary }]}
                >
                  Auto-decline low offers
                </Text>
                <Text
                  style={[styles.fieldHint, { color: colors.textMuted }]}
                >
                  Decline offers below your floor automatically.
                </Text>
              </View>
              <Switch
                value={policy.autoDeclineEnabled}
                onValueChange={handleAutoDeclineToggle}
                trackColor={{
                  false: colors.surfaceAlt,
                  true: colors.brand }}
                thumbColor={colors.scrimTextPrimary}
                accessibilityLabel="Toggle auto-decline"
                accessibilityHint="Enable or disable auto-decline of low offers"
              />
            </View>

            {policy.autoDeclineEnabled && (
              <View style={styles.field}>
                <Text
                  style={[styles.fieldLabel, { color: colors.textSecondary }]}
                >
                  Decline below (gross)
                </Text>
                <View
                  style={[
                    styles.inputWrap,
                    { backgroundColor: colors.input, borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[styles.inputPrefix, { color: colors.textSecondary }]}
                  >
                    {currencySymbol}
                  </Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    value={declineGrossText}
                    onChangeText={handleDeclineGrossChange}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Auto-decline gross floor"
                    accessibilityHint="Decline offers below this amount"
                    returnKeyType="done"
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Preview mode disclosure — honest in every build */}
        {isPreview && (
          <View
            style={[
              styles.previewBanner,
              { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={colors.warning}
              aria-hidden={true}
            />
            <Text style={[styles.previewText, { color: colors.textSecondary }]}>
              {policy.capability.kind === 'preview'
                ? policy.capability.reason
                : 'Smart Sell is in preview.'}
            </Text>
          </View>
        )}

        {/* Decision history — audit trail of auto-negotiation decisions */}
        {policy.enabled && policyId && decisions.length > 0 && (
          <View style={styles.decisionsSection}>
            <Text style={[styles.decisionsTitle, { color: colors.textSecondary }]}>
              Recent decisions
            </Text>
            {decisions.slice(0, 5).map((d) => (
              <View
                key={d.id}
                style={[
                  styles.decisionRow,
                  { borderBottomColor: colors.borderSubtle },
                ]}
              >
                <View style={styles.decisionLeft}>
                  <View
                    style={[
                      styles.decisionDot,
                      {
                        backgroundColor:
                          d.decision === 'accept'
                            ? colors.success
                            : d.decision === 'counter'
                              ? colors.brand
                              : d.decision === 'escalate'
                                ? colors.warning
                                : colors.textMuted },
                    ]}
                  />
                  <View style={styles.decisionText}>
                    <Text
                      style={[styles.decisionAction, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {d.decision === 'accept'
                        ? 'Accepted'
                        : d.decision === 'counter'
                          ? `Countered at ${currencySymbol}${d.counterPriceGbp?.toFixed(2) ?? '—'}`
                          : d.decision === 'escalate'
                            ? 'Escalated to you'
                            : 'Declined'}
                    </Text>
                    <Text
                      style={[styles.decisionReason, { color: colors.textMuted }]}
                      numberOfLines={2}
                    >
                      {d.reason}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.decisionNet, { color: colors.textSecondary }]}>
                  {currencySymbol}{d.netProceedsGbp.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Done button */}
        <Pressable
          style={({ pressed }) => [
            styles.doneBtn,
            { backgroundColor: colors.brand },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => {
            haptic.light();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Done"
          accessibilityHint="Close Smart Sell settings"
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Compact row styles
// ---------------------------------------------------------------------------

function createStyles() {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.sm + 2,
      borderWidth: Stroke.hairline,
      borderRadius: Radius.md,
      minHeight: Control.hit },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      flex: 1 },
    rowText: {
      flex: 1 },
    rowTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: -0.2 },
    rowSummary: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: Space.xxs } });
}

// ---------------------------------------------------------------------------
// Sheet styles
// ---------------------------------------------------------------------------

function createSheetStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingTop: Space.sm,
      paddingHorizontal: Space.md,
      borderTopWidth: Stroke.hairline,
      maxHeight: '85%' },
    handle: {
      width: Space.xxl + Space.sm,
      height: Stroke.standard * 3,
      borderRadius: Radius.sm,
      alignSelf: 'center',
      marginBottom: Space.md },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: -0.4,
      marginBottom: Space.xs },
    subtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight,
      marginBottom: Space.lg },
    field: {
      marginBottom: Space.md },
    fieldLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0.1,
      marginBottom: Space.xs },
    fieldHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      paddingHorizontal: Space.sm + 2,
      minHeight: Control.hit + Space.sm },
    inputPrefix: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      marginRight: Space.xs },
    input: {
      flex: 1,
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      paddingVertical: Space.sm,
      fontVariant: ['tabular-nums'] },
    // Net proceeds illustration
    quoteCard: {
      borderRadius: Radius.md,
      borderWidth: Stroke.hairline,
      padding: Space.md,
      marginBottom: Space.md },
    quoteRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.xs },
    quoteLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    quoteValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] },
    quoteDivider: {
      height: Stroke.hairline,
      marginVertical: Space.xs },
    quoteNetLabel: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    quoteNetValue: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      fontVariant: ['tabular-nums'] },
    // Advanced disclosure
    advancedToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      borderTopWidth: Stroke.hairline,
      borderBottomWidth: Stroke.hairline },
    advancedToggleText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0.15,
      textTransform: 'uppercase' },
    advancedPanel: {
      paddingTop: Space.md },
    autoDeclineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.md,
      marginBottom: Space.md },
    autoDeclineText: {
      flex: 1 },
    // Preview banner
    previewBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      borderRadius: Radius.md,
      borderWidth: Stroke.hairline,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm,
      marginBottom: Space.md },
    previewText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight },
    // Decision history
    decisionsSection: {
      marginBottom: Space.md },
    decisionsTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0.15,
      textTransform: 'uppercase',
      marginBottom: Space.sm },
    decisionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      borderBottomWidth: Stroke.hairline,
      gap: Space.sm },
    decisionLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      flex: 1 },
    decisionDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 5 },
    decisionText: {
      flex: 1 },
    decisionAction: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: -0.2 },
    decisionReason: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: 2 },
    decisionNet: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] },
    // Done button
    doneBtn: {
      borderRadius: Radius.md,
      paddingVertical: Space.sm + 4,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit + Space.sm },
    doneBtnText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.scrimTextPrimary } });
}
