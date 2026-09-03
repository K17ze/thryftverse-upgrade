import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Stroke, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { haptics } from '../../utils/haptics';
import { AppButton } from '../ui/AppButton';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { PriceAlertCondition } from '../../hooks/usePriceAlertForm';

/**
 * Price alert creation modal — flagship treatment with semantic condition
 * colours. Extracted verbatim from AssetDetailScreen; behaviour, props,
 * and styles are unchanged.
 */
export interface CoOwnPriceAlertFormProps {
  visible: boolean;
  onClose: () => void;
  alertTargetPrice: string;
  onAlertTargetPriceChange: (text: string) => void;
  alertCondition: PriceAlertCondition;
  onAlertConditionChange: (condition: PriceAlertCondition) => void;
  alertSubmitting: boolean;
  onSubmit: () => void;
}

export function CoOwnPriceAlertForm({
  visible,
  onClose,
  alertTargetPrice,
  onAlertTargetPriceChange,
  alertCondition,
  onAlertConditionChange,
  alertSubmitting,
  onSubmit,
}: CoOwnPriceAlertFormProps) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[priceAlertStyles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[priceAlertStyles.sheet, { backgroundColor: colors.surface }]}>
          {/* Header with icon */}
          <View style={priceAlertStyles.headerRow}>
            <View style={[priceAlertStyles.headerIcon, { backgroundColor: colors.brand }]}>
              <Ionicons name="notifications" size={20} color={colors.textInverse} />
            </View>
            <View style={priceAlertStyles.headerText}>
              <Text style={[priceAlertStyles.sheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>Create price alert</Text>
              <Text style={[priceAlertStyles.sheetSubtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
                Get notified when the price {alertCondition === 'above' ? 'rises above' : 'drops below'} your target.
              </Text>
            </View>
          </View>

          {/* Condition selector — semantic colours */}
          <Text style={[priceAlertStyles.inputLabel, { color: colors.textSecondary }]}>Condition</Text>
          <View style={priceAlertStyles.conditionRow}>
            {(['above', 'below'] as const).map((c) => {
              const isSelected = alertCondition === c;
              const semanticColor = c === 'above' ? colors.success : colors.danger;
              return (
                <Pressable
                  key={c}
                  style={({ pressed }) => [
                    priceAlertStyles.conditionTab,
                    {
                      backgroundColor: isSelected ? semanticColor : colors.surfaceAlt,
                      borderColor: isSelected ? semanticColor : colors.border,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => { haptics.tap(); onAlertConditionChange(c); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Alert when price goes ${c}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Ionicons
                    name={c === 'above' ? 'arrow-up' : 'arrow-down'}
                    size={18}
                    color={isSelected ? colors.textInverse : colors.textSecondary}
                  />
                  <Text style={[priceAlertStyles.conditionText, { color: isSelected ? colors.textInverse : colors.textSecondary }]}>
                    {c === 'above' ? 'Above' : 'Below'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Price input */}
          <Text style={[priceAlertStyles.inputLabel, { color: colors.textSecondary }]}>Target price ({currencySymbol})</Text>
          <TextInput
            style={[priceAlertStyles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
            value={alertTargetPrice}
            onChangeText={onAlertTargetPriceChange}
            placeholder="e.g. 25.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabel="Target price"
          />

          <View style={priceAlertStyles.actions}>
            <AppButton
              title="Cancel"
              onPress={onClose}
              variant="secondary"
              size="md"
              style={{ flex: 1, marginRight: Space.sm }}
            />
            <AppButton
              title={alertSubmitting ? 'Creating…' : 'Create alert'}
              onPress={() => { haptics.tap(); onSubmit(); }}
              variant="primary"
              size="md"
              disabled={alertSubmitting || !alertTargetPrice}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const priceAlertStyles = StyleSheet.create({
  // ── Price alert sheet — calm, professional modal ──
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RadiusRoleValue.standalonePanel,
    borderTopRightRadius: RadiusRoleValue.standalonePanel,
    padding: Space.lg,
    paddingBottom: Space.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    marginBottom: Space.lg,
  },
  headerIcon: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: RadiusRoleValue.pillAvatar,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    marginBottom: Space.xs - 2,
  },
  // Sheet subtitle — captionElevated for quiet, professional explanation.
  sheetSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  conditionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
  },
  // Condition text uses body (14/20/400) for clear readability.
  conditionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  // Input label — captionElevated for quiet hierarchy.
  inputLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.xs,
  },
  // Price input — tabular-nums for stable numeric entry.
  input: {
    borderWidth: Stroke.standard,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
    marginBottom: Space.lg,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
  },
});
