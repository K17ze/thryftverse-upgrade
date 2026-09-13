import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  icon: IoniconName;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

// Partial-data inline prompt (§14). Quiet, friendly — the checkout is
// still usable. Distinct from full error states.
function CheckoutPartialDataBannerBase({ icon, message, actionLabel, onAction }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.banner}>
      <Ionicons name={icon} size={16} color={colors.warning} importantForAccessibility="no" />
      <Text style={styles.message} numberOfLines={3} maxFontSizeMultiplier={2}>
        {message}
      </Text>
      <Pressable
        style={styles.action}
        onPress={onAction}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityHint="Retry loading the missing checkout details"
      >
        <Text style={styles.actionText} maxFontSizeMultiplier={2}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const CheckoutPartialDataBanner = React.memo(CheckoutPartialDataBannerBase);
CheckoutPartialDataBanner.displayName = 'CheckoutPartialDataBanner';
export { CheckoutPartialDataBanner };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.hairline,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSubtle,
  },
  message: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
    color: colors.warning,
  },
  action: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    minHeight: Control.chromeCompact,
    justifyContent: 'center',
    // TODO: replace `${colors.warning}80` and `${colors.surfaceAlt}99` with tokens when available
    borderColor: `${colors.warning}80`,
    backgroundColor: `${colors.surfaceAlt}99`,
  },
  actionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.warning,
  },
});
