import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type, Typography, Radius } from '../../../theme/designTokens';
import type {
  CommerceDetailFamily,
  CommerceDetailIdentityDensity,
} from './types';

// ── Media overlay text constants ──
// Text rendered on top of media (images) is always white regardless of
// theme mode — both light and dark apps use white text on image overlays
// (Instagram, Depop, Vinted pattern). These are media-specific constants,
// not theme colours, because no ThemeColors entry maps to "always white
// on media" in both modes.
const MEDIA_TEXT_PRIMARY = '#FFFFFF';
const MEDIA_TEXT_SECONDARY = 'rgba(255,255,255,0.76)';
const MEDIA_TEXT_MUTED = 'rgba(255,255,255,0.6)';
const MEDIA_TEXT_TERTIARY = 'rgba(255,255,255,0.72)';
const MEDIA_TEXT_BODY = 'rgba(255,255,255,0.8)';
const MEDIA_SHADOW = 'rgba(0,0,0,0.55)';
const MEDIA_SHADOW_SOFT = 'rgba(0,0,0,0.5)';
const MEDIA_SHADOW_LIGHT = 'rgba(0,0,0,0.45)';
const MEDIA_SHADOW_SUBTLE = 'rgba(0,0,0,0.4)';

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
  family = 'direct',
  density = 'standard',
  tone = 'canvas',
}: CommerceDetailIdentityProps) {
  const { colors } = useAppTheme();
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
    { color: isMedia ? MEDIA_TEXT_PRIMARY : colors.textPrimary },
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
                { color: isMedia ? MEDIA_TEXT_SECONDARY : colors.textSecondary },
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

      {(showPrimaryValue || showOriginalValue || showDiscountBadge || secondaryLine || interestSignal) && (
        <View style={styles.valueRow}>
          {showPrimaryValue ? (
            <Text
              style={[
                styles.primaryValue,
                isMedia && styles.primaryValueMedia,
                { color: isMedia ? MEDIA_TEXT_PRIMARY : colors.textPrimary },
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
                { color: isMedia ? MEDIA_TEXT_MUTED : colors.textMuted },
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
          {secondaryLine ? (
            <Text
              style={[
                styles.secondaryLine,
                isMedia && styles.secondaryLineMedia,
                { color: isMedia ? MEDIA_TEXT_BODY : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {secondaryLine}
            </Text>
          ) : null}
        </View>
      )}

      {interestSignal ? (
        <Text
          style={[
            styles.interest,
            isMedia && styles.interestMedia,
            { color: isMedia ? MEDIA_TEXT_TERTIARY : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {interestSignal}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  containerMedia: {
    maxWidth: '88%',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs,
  },
  eyebrow: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  eyebrowMedia: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
    textShadowColor: MEDIA_SHADOW_SOFT,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  title: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight + 2,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  titleDirect: {
    fontSize: Type.priceLarge.size + 2,
    lineHeight: Type.priceLarge.lineHeight + 3,
    letterSpacing: -0.65,
  },
  titleAuction: {
    fontSize: Type.priceLarge.size - 2,
    lineHeight: Type.priceLarge.lineHeight - 1,
    letterSpacing: -0.4,
  },
  titleCoOwn: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight + 1,
    letterSpacing: -0.45,
  },
  titleMedia: {
    fontSize: Type.priceLarge.size - 1,
    lineHeight: Type.priceLarge.lineHeight - 1,
    letterSpacing: -0.6,
    textShadowColor: MEDIA_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  containerAuction: {
    paddingBottom: Space.xs,
  },
  containerCoOwn: {
    paddingBottom: Space.xs,
  },
  // Per spec 05 §3: compact width uses 26pt title with tighter line
  // height so long titles do not crowd the first viewport.
  titleCompact: {
    fontSize: Type.priceLarge.size - 2,
    lineHeight: Type.priceLarge.lineHeight - 1,
  },
  // Value row: price + secondary line sit on one baseline row. The
  // price is dominant; the secondary line is a quiet truth partner.
  // Wrapping is suppressed so the price never stacks below itself.
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  // Per Design.md: the in-page product price is the primary price
  // anchor — larger than a line item (priceList 20px) but smaller
  // than a checkout total (priceLarge 28px). 22px matches the
  // media-tone variant. The dock carries its own priceList (20px)
  // value, so the identity price remains the visual anchor while
  // the dock is the actionable repetition.
  primaryValue: {
    fontSize: Type.priceList.size + 2,
    lineHeight: Type.priceList.lineHeight + 3,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  primaryValueMedia: {
    fontSize: Type.priceList.size + 2,
    lineHeight: Type.priceList.lineHeight + 3,
    letterSpacing: -0.3,
    textShadowColor: MEDIA_SHADOW_SOFT,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  // Strikethrough original price — quiet, muted, line-through.
  // Depop/eBay pattern: shows the savings visually without requiring
  // the user to read the secondary line.
  originalValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  // Discount badge — small danger-tinted pill with the savings %.
  // eBay pattern: draws the eye to the deal without dominating.
  discountBadge: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginTop: Space.xs / 2,
  },
  discountBadgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  secondaryLine: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
  },
  secondaryLineMedia: {
    fontFamily: Typography.family.medium,
    textShadowColor: MEDIA_SHADOW_LIGHT,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  // Interest signal sits on its own line below the value row — a
  // quiet metadata line, not a third member of the value cluster.
  interest: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    marginTop: Space.xs,
  },
  interestMedia: {
    fontFamily: Typography.family.medium,
    textShadowColor: MEDIA_SHADOW_SUBTLE,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
});
