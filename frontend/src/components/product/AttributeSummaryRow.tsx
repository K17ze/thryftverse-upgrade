import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, FontFamily, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { Listing } from '../../services/listingsApi';
import { buildAttributeLine } from '../../utils/itemDetailDerived';

// ───────────────────────────────────────────────────────────────────────────
// AttributeSummaryRow — the consolidated attribute row inside the identity
// chapter: condition chip, size/category, social proof, and the size-guide
// link. Replaces the former 3 separate thin metadata lines.
// ───────────────────────────────────────────────────────────────────────────

export interface AttributeSummaryRowProps {
  item: Listing;
  conditionMeta: { color: string; definition: string } | null;
  socialProofLine?: string;
  priceIzeText?: string | null;
  onConditionInfo: () => void;
  onSizeGuide: () => void;
  colors: ThemeColors;
}

export function AttributeSummaryRow({
  item,
  conditionMeta,
  socialProofLine,
  priceIzeText,
  onConditionInfo,
  onSizeGuide,
  colors,
}: AttributeSummaryRowProps) {
  const attributeLine = buildAttributeLine(item);
  if (!attributeLine && !socialProofLine && !priceIzeText) return null;

  return (
    <>
      <View style={styles.attributeRow}>
        <View style={styles.attributeLeftCluster}>
          {/* Condition chip — condition gets a distinct visual treatment
              instead of blending into muted text. It is the most important
              attribute for second-hand buyers, so it earns its own
              affordance and a tap target that opens the definition. */}
          {item.condition ? (
            <Pressable
              onPress={onConditionInfo}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              style={[
                styles.conditionChip,
                {
                  // TODO: Replace runtime conditionMeta.color hex-alpha with theme token when color source is staticized
                  borderColor: conditionMeta ? `${conditionMeta.color}66` : colors.borderSubtle,
                  backgroundColor: conditionMeta ? `${conditionMeta.color}14` : 'transparent',
                },
              ]}
              accessibilityLabel={`Condition: ${item.condition}. Tap for definition.`}
              accessibilityRole="button"
            >
              <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
              <Text style={[styles.conditionChipText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1}>
                {item.condition}
              </Text>
              <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {(() => {
            const remaining = [
              item.size && `Size ${item.size}`,
              item.category,
            ].filter(Boolean).join(' · ');
            return remaining ? (
              <Text style={[styles.attributeText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1}>
                {remaining}
              </Text>
            ) : null;
          })()}
          {/* Social proof — truthful engagement signals (active offers,
              views) rendered as a quiet trailing element in the same row.
              Only included when the backend provides positive counts. */}
          {socialProofLine ? (
            <Text style={[styles.socialProofInline, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1}>
              · {socialProofLine}
            </Text>
          ) : null}
        </View>
        {item.size && (
          <Pressable
            onPress={onSizeGuide}
            hitSlop={8}
            style={styles.quietTextTarget}
            accessibilityLabel="View size guide"
            accessibilityRole="button"
          >
            <Text style={[styles.sizeGuideLink, { color: colors.brand }]} maxFontSizeMultiplier={1}>
              Size guide
            </Text>
          </Pressable>
        )}
      </View>

      {/* izeText — quiet 1ZE-equivalent value on its own line below the
          attribute row. Kept separate because it is a price-adjacent fact,
          not an attribute. */}
      {priceIzeText ? (
        <Text style={[styles.izeText, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1}>
          {priceIzeText}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
  conditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
    borderColor: 'transparent',
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
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
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
  socialProofInline: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    flexShrink: 1,
  },
});
