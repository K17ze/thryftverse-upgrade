import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space, Stroke, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  getSlotLabel,
  type CompatibilityResult,
  type OutfitSlot } from '../../services/styleGraph';
import { AnimatedPressable } from '../AnimatedPressable';
import { T } from '../ui/Text';
import { haptics } from '../../utils/haptics';
import { OUTFIT_SLOTS, type OutfitItemsMap } from './outfitBuilderViewModels';
import { OutfitBuilderSlotCircle } from './OutfitBuilderSlotCircle';
import { OutfitBuilderScoreBadge } from './OutfitBuilderScoreBadge';

export interface OutfitBuilderPreviewProps {
  outfitItems: OutfitItemsMap;
  activeSlot: OutfitSlot;
  onSlotPress: (slot: OutfitSlot) => void;
  slotSize: number;
  compatibility: CompatibilityResult;
  filledCount: number;
  backgroundColor: string | undefined;
  onBackgroundChange: (color: string | undefined) => void;
}

/**
 * Outfit preview canvas — slot circles, compatibility score row, and the
 * background swatch picker. Layout preserved verbatim from the original
 * screen (including the swatch's direct state write, no history push).
 */
function OutfitBuilderPreviewImpl({
  outfitItems,
  activeSlot,
  onSlotPress,
  slotSize,
  compatibility,
  filledCount,
  backgroundColor,
  onBackgroundChange }: OutfitBuilderPreviewProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.previewWrap, backgroundColor ? { backgroundColor } : undefined]}>
      <View style={styles.slotRow}>
        {OUTFIT_SLOTS.map((slot) => (
          <View key={slot} style={styles.slotWrap}>
            <OutfitBuilderSlotCircle
              slot={slot}
              item={outfitItems[slot]}
              isActive={activeSlot === slot}
              onPress={() => onSlotPress(slot)}
              slotSize={slotSize}
            />
            <T.Meta color={activeSlot === slot ? colors.brand : colors.textMuted} style={styles.slotLabel}>
              {getSlotLabel(slot)}
            </T.Meta>
          </View>
        ))}
      </View>

      {/* Score & Tags */}
      <View style={styles.scoreRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
          <OutfitBuilderScoreBadge score={compatibility.score} />
          <View>
            <T.Caption color={colors.textPrimary} style={{ fontFamily: Typography.family.bold }}>
              Compatibility
            </T.Caption>
            <T.Meta color={colors.textMuted}>
              {compatibility.reasons.join(' · ') || 'Select items to score'}
            </T.Meta>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: Space.xs }}>
          <T.Meta color={colors.textMuted}>{filledCount}/{OUTFIT_SLOTS.length}</T.Meta>
        </View>
      </View>

      {/* Background color picker */}
      <View style={styles.bgRow}>
        <T.Meta color={colors.textMuted}>Background</T.Meta>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bgSwatches}>
          <AnimatedPressable
            style={[styles.swatch, !backgroundColor && styles.swatchActive]}
            onPress={() => { haptics.tap(); onBackgroundChange(undefined); }}
            accessibilityRole="button"
            accessibilityLabel="Default background"
            accessibilityState={{ selected: !backgroundColor }}
          >
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </AnimatedPressable>
          {colors.outfitBackgrounds.map((c) => (
            <AnimatedPressable
              key={c}
              style={[
                styles.swatch,
                { backgroundColor: c },
                backgroundColor === c && styles.swatchActive,
              ]}
              onPress={() => { haptics.tap(); onBackgroundChange(c); }}
              accessibilityRole="button"
              accessibilityLabel={`Background color ${c}`}
              accessibilityState={{ selected: backgroundColor === c }}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export const OutfitBuilderPreview = React.memo(OutfitBuilderPreviewImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  previewWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    padding: Space.md },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Space.md },
  slotWrap: {
    alignItems: 'center',
    gap: Space.xs },
  slotLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: Stroke.standard,
    borderTopColor: colors.border,
    paddingTop: Space.md },
  bgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
    paddingTop: Space.md,
    marginTop: Space.md },
  bgSwatches: {
    flexDirection: 'row',
    gap: Space.xs,
    alignItems: 'center' },
  swatch: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center' },
  swatchActive: {
    borderWidth: Stroke.emphasis,
    borderColor: colors.brand } });
}
