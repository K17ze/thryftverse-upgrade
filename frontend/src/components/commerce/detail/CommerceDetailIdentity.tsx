import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type, Typography } from '../../../theme/designTokens';
import type {
  CommerceDetailFamily,
  CommerceDetailIdentityDensity,
} from './types';

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

  const titleStyle = [
    styles.title,
    family === 'direct' && styles.titleDirect,
    family === 'auction' && styles.titleAuction,
    family === 'co_own' && styles.titleCoOwn,
    density === 'compact' && styles.titleCompact,
    isMedia && styles.titleMedia,
    { color: isMedia ? '#FFFFFF' : colors.textPrimary },
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
                { color: isMedia ? 'rgba(255,255,255,0.76)' : colors.textSecondary },
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

      {(showPrimaryValue || secondaryLine || interestSignal) && (
        <View style={styles.valueRow}>
          {showPrimaryValue ? (
            <Text
              style={[
                styles.primaryValue,
                isMedia && styles.primaryValueMedia,
                { color: isMedia ? '#FFFFFF' : colors.textPrimary },
              ]}
              accessibilityRole="text"
            >
              {showPrimaryValue}
            </Text>
          ) : null}
          {secondaryLine ? (
            <Text
              style={[
                styles.secondaryLine,
                isMedia && styles.secondaryLineMedia,
                { color: isMedia ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
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
            { color: isMedia ? 'rgba(255,255,255,0.72)' : colors.textMuted },
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
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  titleDirect: {
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.65,
  },
  titleAuction: {
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.4,
  },
  titleCoOwn: {
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  titleMedia: {
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.6,
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
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
    fontSize: 26,
    lineHeight: 31,
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
  primaryValue: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  primaryValueMedia: {
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.3,
  },
  secondaryLine: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
  },
  secondaryLineMedia: {
    fontFamily: Typography.family.medium,
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
  },
});
