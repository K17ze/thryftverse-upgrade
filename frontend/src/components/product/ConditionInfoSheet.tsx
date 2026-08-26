import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

interface ConditionMeta {
  color: string;
  definition: string;
}

export interface ConditionInfoSheetProps {
  visible: boolean;
  onDismiss: () => void;
  condition?: string | null;
  conditionMeta: ConditionMeta | null;
  hasMultipleImages: boolean;
  onViewConditionPhotos: () => void;
}

/**
 * Condition definition bottom sheet — surfaces the condition label, its
 * semantic accent, a plain-English definition, and a jump to the
 * condition-evidence photos. Extracted from ItemDetailScreen.
 */
export function ConditionInfoSheet({
  visible,
  onDismiss,
  condition,
  conditionMeta,
  hasMultipleImages,
  onViewConditionPhotos,
}: ConditionInfoSheetProps) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.42}>
      <View style={styles.conditionSheetWrap}>
        <View style={styles.conditionSheetHeader}>
          <Text style={[styles.conditionSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
            Condition
          </Text>
          <Pressable
            onPress={onDismiss}
            style={styles.sheetCloseTarget}
            accessibilityLabel="Close condition definition"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.conditionSheetBody}>
          <View style={[styles.conditionSheetBadge, { backgroundColor: conditionMeta ? `${conditionMeta.color}1F` : colors.surfaceAlt }]}>
            <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
            <Text style={[styles.conditionSheetBadgeText, { color: conditionMeta?.color ?? colors.textPrimary }]} maxFontSizeMultiplier={1}>
              {condition}
            </Text>
          </View>
          {conditionMeta ? (
            <Text style={[styles.conditionSheetDefinition, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
              {conditionMeta.definition}
            </Text>
          ) : null}
          {hasMultipleImages ? (
            <Pressable
              style={({ pressed }) => [styles.conditionEvidenceJump, pressed && styles.pressed]}
              onPress={onViewConditionPhotos}
              accessibilityLabel="View condition evidence photos"
              accessibilityRole="button"
            >
              <Ionicons name="images-outline" size={18} color={colors.brand} />
              <Text style={[styles.conditionEvidenceJumpText, { color: colors.brand }]} maxFontSizeMultiplier={1}>
                View condition photos
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.brand} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  conditionSheetWrap: {
    paddingBottom: Space.md,
  },
  conditionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm,
  },
  conditionSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  conditionSheetBody: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.md,
  },
  conditionSheetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: RadiusRoleValue.sheetDialog,
  },
  conditionSheetBadgeText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  conditionSheetDefinition: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.xs,
    fontFamily: FontFamily.regular,
  },
  conditionEvidenceJump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  conditionEvidenceJumpText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  conditionDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
    flexShrink: 0,
  },
  sheetCloseTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
