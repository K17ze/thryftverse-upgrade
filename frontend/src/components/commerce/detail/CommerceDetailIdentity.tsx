import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type {
  CommerceDetailFamily,
  CommerceDetailIdentityDensity } from './types';

/**
 * Identity seam — one compact identity composition immediately after
 * the hero.
 *
 * Per spec 02:
 *   - family/brand/category line (one eyebrow max);
 *   - title (26–32pt, max two lines, not repeated elsewhere);
 *   - primary commerce value;
 *   - one secondary truth line;
 *   - seller/issuer identity (rendered via CommerceDetailSellerRow
 *     by the screen, not here, so this stays a pure identity block);
 *   - no large independent Watch card;
 *   - no uppercase eyebrow unless it meaningfully distinguishes family
 *     or brand.
 *
 * Per spec 05 §3 (family-aware identity):
 *   - Direct may show price.
 *   - Auction must not show price.
 *   - Co-Own must not show price.
 *   - Compact width uses 26pt title.
 *   - Standard uses 28–30pt.
 *   - Long titles use tighter size/line height.
 *   - Maximum two lines.
 *
 * This is intentionally a flat composition — no card, no border, no
 * surface fill. The page background carries the layout.
 */
export interface CommerceDetailIdentityProps {
  /** Single eyebrow line — family / brand / category. Omit when empty. */
  eyebrow?: string;
  title: string;
  /** Primary transaction value (price / current bid / last trade).
   *
   * Family rule: only `direct` may show price here. Auction and Co-Own
   * own their dominant value in the transaction surface. */
  primaryValue?: string;
  /** Original price shown with strikethrough when a discount is active.
   * Rendered to the right of primaryValue in the value row.
   * Direct family only. */
  originalValue?: string;
  /** Discount percentage badge (e.g. "-20%"). Rendered after the
   * strikethrough original price. Direct family only. */
  discountBadge?: string;
  /** One secondary truth line (e.g. "Original £120" or "5 bids"). */
  secondaryLine?: string;
  /** Optional compact interest signal (e.g. "23 watching"). */
  interestSignal?: string;
  /** Optional small family chip rendered inline with the eyebrow. */
  familyChip?: React.ReactNode;
  /** Optional single quiet trust row (e.g. seller verification) rendered
   *  under the price/identity block. Height-capped, no card or badge
   *  chrome. Omit for zero visual change. */
  trustSlot?: React.ReactNode;
  /** Family variant — controls price eligibility and title rhythm.
   * Defaults to `direct` for backward compatibility. */
  family?: CommerceDetailFamily;
  /** Density — compact uses 26pt title, standard uses 28pt. */
  density?: CommerceDetailIdentityDensity;
  /** Media treatment mirrors the editorial captions used by the auction
   * and Co-Own discovery surfaces. */
  tone?: 'canvas' | 'media';
}

export function CommerceDetailIdentity({
  eyebrow,
  title,
  primaryValue,
  originalValue,
  discountBadge,
  secondaryLine,
  interestSignal,
  familyChip,
  trustSlot,
  family = 'direct',
  density = 'standard',
  tone = 'canvas' }: CommerceDetailIdentityProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isMedia = tone === 'media';

  // Per spec 05 §3: only Direct may show price in identity.
  // Auction and Co-Own own their dominant value in the transaction
  // surface, so we suppress primaryValue here to prevent duplicated
  // price hierarchy.
  const showPrimaryValue = family === 'direct' ? primaryValue : undefined;
  const showOriginalValue = family === 'direct' ? originalValue : undefined;
  const showDiscountBadge = family === 'direct' ? discountBadge : undefined;

  const titleStyle = [
    styles.title,
    family === 'direct' && styles.titleDirect,
    family === 'auction' && styles.titleAuction,
    family === 'co_own' && styles.titleCoOwn,
    density === 'compact' && styles.titleCompact,
    isMedia && styles.titleMedia,
    { color: isMedia ? colors.scrimTextPrimary : colors.textPrimary },
  ];

  return (
    <View
      style={[
        styles.container,
        family === 'auction' && styles.containerAuction,
        family === 'co_own' && styles.containerCoOwn,
        isMedia && styles.containerMedia,
      ]}
    >
      {(eyebrow || familyChip) && (
        <View style={styles.eyebrowRow}>
          {eyebrow ? (
            <Text
              style={[
                styles.eyebrow,
                isMedia && styles.eyebrowMedia,
                { color: isMedia ? colors.scrimTextSecondary : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {eyebrow}
            </Text>
          ) : null}
          {familyChip}
        </View>
      )}

      <Text
        style={titleStyle}
        numberOfLines={2}
        accessibilityRole="header"
      >
        {title}
      </Text>

      {(showPrimaryValue || showOriginalValue || showDiscountBadge) && (
        <View style={styles.valueRow}>
          {showPrimaryValue ? (
            <Text
              style={[
                styles.primaryValue,
                isMedia && styles.primaryValueMedia,
                { color: isMedia ? colors.scrimTextPrimary : colors.textPrimary },
              ]}
              accessibilityRole="text"
            >
              {showPrimaryValue}
            </Text>
          ) : null}
          {showOriginalValue ? (
            <Text
              style={[
                styles.originalValue,
                { color: isMedia ? colors.scrimTextTertiary : colors.textMuted },
              ]}
              accessibilityRole="text"
            >
              {showOriginalValue}
            </Text>
          ) : null}
          {showDiscountBadge ? (
            <View style={[styles.discountBadge, { backgroundColor: colors.danger }]}>
              <Text style={[styles.discountBadgeText, { color: colors.textInverse }]}>
                {showDiscountBadge}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Secondary truth line — sits on its own line below the price
          row so the price dominates without competition. Per 2026 PDP
          research: "Price first, CTA immediately after." The secondary
          line is a quiet truth partner, not a co-equal on the baseline. */}
      {secondaryLine ? (
        <Text
          style={[
            styles.secondaryLine,
            isMedia && styles.secondaryLineMedia,
            { color: isMedia ? colors.scrimTextSecondary : colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {secondaryLine}
        </Text>
      ) : null}

      {interestSignal ? (
        <Text
          style={[
            styles.interest,
            isMedia && styles.interestMedia,
            { color: isMedia ? colors.scrimTextSecondary : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {interestSignal}
        </Text>
      ) : null}

      {trustSlot ? (
        <View style={styles.trustSlot}>
          {trustSlot}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm },
  containerMedia: {
    maxWidth: '88%',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0 },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs },
  eyebrow: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  eyebrowMedia: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.label.letterSpacing,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6 },
  title: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight + 2,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: -0.5 },
  titleDirect: {
    fontSize: TypographyV2.priceHero.size + 2,
    lineHeight: TypographyV2.priceHero.lineHeight + 3,
    letterSpacing: -0.65 },
  titleAuction: {
    fontSize: TypographyV2.priceHero.size - 2,
    lineHeight: TypographyV2.priceHero.lineHeight - 1,
    letterSpacing: -0.4 },
  titleCoOwn: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight + 1,
    letterSpacing: -0.45 },
  titleMedia: {
    fontSize: TypographyV2.priceHero.size - 1,
    lineHeight: TypographyV2.priceHero.lineHeight - 1,
    letterSpacing: -0.6,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12 },
  containerAuction: {
    paddingBottom: Space.xs },
  containerCoOwn: {
    paddingBottom: Space.xs },
  // Per spec 05 §3: compact width uses 26pt title with tighter line
  // height so long titles do not crowd the first viewport.
  titleCompact: {
    fontSize: TypographyV2.priceHero.size - 2,
    lineHeight: TypographyV2.priceHero.lineHeight - 1 },
  // Quiet trust row under the price/identity block — one compact line,
  // height-capped, no card or badge chrome.
  trustSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.xs,
    maxHeight: 28 },
  // Value row: price + secondary line sit on one baseline row. The
  // price is dominant; the secondary line is a quiet truth partner.
  // Wrapping is suppressed so the price never stacks below itself.
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
    marginTop: Space.sm },
  // Per Design.md: the in-page product price is the primary price
  // anchor — larger than a line item (priceList 20px) but smaller
  // than a checkout total (priceLarge 28px). 22px matches the
  // media-tone variant. The dock carries its own priceList (20px)
  // value, so the identity price remains the visual anchor while
  // the dock is the actionable repetition.
  primaryValue: {
    fontSize: TypographyV2.priceList.size + 2,
    lineHeight: TypographyV2.priceList.lineHeight + 3,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] },
  primaryValueMedia: {
    fontSize: TypographyV2.priceList.size + 2,
    lineHeight: TypographyV2.priceList.lineHeight + 3,
    letterSpacing: -0.3,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8 },
  // Strikethrough original price — quiet, muted, line-through.
  // Depop/eBay pattern: shows the savings visually without requiring
  // the user to read the secondary line.
  originalValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'] },
  // Discount badge — small danger-tinted pill with the savings %.
  // eBay pattern: draws the eye to the deal without dominating.
  discountBadge: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginTop: Space.xs / 2 },
  discountBadgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  // Secondary truth line — now on its own line below the price row.
  // marginTop Space.xs keeps it close to the price so it reads as a
  // truth partner, not a disconnected metadata fragment.
  secondaryLine: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    flexShrink: 1,
    marginTop: Space.xs },
  secondaryLineMedia: {
    fontFamily: FontFamily.medium,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6 },
  // Interest signal sits on its own line below the value row — a
  // quiet metadata line, not a third member of the value cluster.
  interest: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs },
  interestMedia: {
    fontFamily: FontFamily.medium,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5 } });
