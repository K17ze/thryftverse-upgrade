import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { Space, Control, Stroke } from '../../../theme/designTokens';
import { FontFamily } from '../../../theme/fontFamily';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../../AnimatedPressable';
import { CommerceDetailIdentity } from './CommerceDetailIdentity';
import type { Listing } from '../../../services/listingsApi';

/**
 * Editorial identity block — title, condition chip, attribute row,
 * size-guide link, and price/ize text.
 *
 * This is the Zone B identity seam: media establishes desire first,
 * then the stable editorial canvas owns brand, identity and price.
 * The dock is the only actionable repetition of that price.
 */
export interface CommerceIdentityBlockProps {
  item: Listing;
  displayTitle: string;
  formattedPrice: string;
  formattedOriginal: string | null;
  hasDiscount: boolean;
  discountPercent: number | null;
  secondaryLine: string | undefined;
  interestSignal: string | undefined;
  priceIzeText: string | null;
  attributeLine: string;
  socialProofLine: string | undefined;
  conditionMeta: { color: string; definition: string } | null;
  isCompactScreen: boolean;
  onConditionPress: () => void;
  onSizeGuidePress: () => void;
}

export function CommerceIdentityBlock({
  item,
  displayTitle,
  formattedPrice,
  formattedOriginal,
  hasDiscount,
  discountPercent,
  secondaryLine,
  interestSignal,
  priceIzeText,
  attributeLine,
  socialProofLine,
  conditionMeta,
  isCompactScreen,
  onConditionPress,
  onSizeGuidePress,
}: CommerceIdentityBlockProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.editorialIdentityChapter}>
      <CommerceDetailIdentity
        family="direct"
        tone="canvas"
        density={isCompactScreen ? 'compact' : 'standard'}
        eyebrow={item.brand ?? item.category ?? undefined}
        title={displayTitle}
        primaryValue={formattedPrice}
        originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
        discountBadge={hasDiscount && discountPercent ? `-${Math.round(discountPercent)}%` : undefined}
        secondaryLine={secondaryLine}
        interestSignal={interestSignal}
      />

      {/* ── Consolidated attribute row ──
          Condition chip, size/category, social proof, and izeText
          in one composed row — replaces the former 3 separate thin
          metadata lines (socialProofLine, attributeRow, izeText)
          that created label-everything disease. Per AGENTS.md §4:
          "Real apps show less: the object is the label." Per 2026
          PDP research: "The first viewport normally uses no more
          than three type sizes and one eyebrow." */}
      {(attributeLine || socialProofLine || priceIzeText) ? (
        <View style={styles.attributeRow}>
          <View style={styles.attributeLeftCluster}>
            {/* Condition chip — condition gets a distinct visual
                treatment instead of blending into muted text. It
                is the most important attribute for second-hand
                buyers, so it earns its own affordance and a tap
                target that opens the definition. */}
            {item.condition ? (
              <AnimatedPressable
                onPress={onConditionPress}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                style={[
                  styles.conditionChip,
                  {
                    borderColor: conditionMeta ? `${conditionMeta.color}66` : colors.borderSubtle,
                    backgroundColor: conditionMeta ? `${conditionMeta.color}14` : 'transparent',
                  },
                ]}
                scaleValue={0.98}
                hapticFeedback="light"
                accessibilityLabel={`Condition: ${item.condition}. Tap for definition.`}
                accessibilityRole="button"
              >
                <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
                <Text style={[styles.conditionChipText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.4}>
                  {item.condition}
                </Text>
                <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
              </AnimatedPressable>
            ) : null}
            {(() => {
              const remaining = [
                item.size && `Size ${item.size}`,
                item.category,
              ].filter(Boolean).join(' · ');
              return remaining ? (
                <Text style={[styles.attributeText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                  {remaining}
                </Text>
              ) : null;
            })()}
            {/* Social proof — truthful engagement signals (active
                offers, views) rendered as a quiet trailing element
                in the same row. Only included when the backend
                provides positive counts — never fabricated. */}
            {socialProofLine ? (
              <Text style={[styles.socialProofInline, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                · {socialProofLine}
              </Text>
            ) : null}
          </View>
          {item.size && (
            <AnimatedPressable
              onPress={onSizeGuidePress}
              hitSlop={8}
              style={styles.quietTextTarget}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityLabel="View size guide"
              accessibilityRole="button"
            >
              <Text style={[styles.sizeGuideLink, { color: colors.brand }]} maxFontSizeMultiplier={1.4}>
                Size guide
              </Text>
            </AnimatedPressable>
          )}
        </View>
      ) : null}

      {/* izeText — quiet 1ZE-equivalent value on its own line
          below the attribute row. Kept separate because it is a
          price-adjacent fact, not an attribute. */}
      {priceIzeText ? (
        <Text style={[styles.izeText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {priceIzeText}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  editorialIdentityChapter: {
    // Between-group spacing after full-bleed media. 16px (Space.md)
    // creates a deliberate chapter break without excessive white space.
    // The media is the product; the canvas is the author — the
    // transition should feel deliberate but not distant.
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  // ── Attribute row ──
  // Rendered inside the identity's padding rhythm — no separate
  // horizontal padding. The negative top margin pulls it closer to
  // the identity block so it reads as part of the composition.
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginTop: 0,
    paddingBottom: Space.sm,
  },
  attributeLeftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 1,
  },
  // Condition chip — condition gets a distinct visual treatment
  // (small surface-alt pill) instead of blending into muted text.
  // It's the most important attribute for second-hand buyers.
  // Compact contained control, 32px visible chrome inside 44px hit
  // target. paddingVertical 5 gives a 26px visible height with 12px
  // caption text — premium pill proportion.
  conditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
    borderColor: 'transparent', // overridden inline with theme color
    flexShrink: 0,
  },
  conditionDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
    flexShrink: 0,
  },
  conditionChipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  attributeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  sizeGuideLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    flexShrink: 0,
  },
  quietTextTarget: {
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  izeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // ── Social proof inline ──
  // Quiet trailing element inside the attribute row's left cluster.
  // Muted, single line, prefixed with "·" so it reads as a continuation
  // of the attribute line rather than a separate metadata fragment.
  socialProofInline: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 1,
  },
});
