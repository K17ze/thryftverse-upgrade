import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  icon: IoniconName;
  title: string;
  body: string;
  ctaLabel: string;
  onCtaPress: () => void;
}

// Full-screen guard state for checkout dead-ends (signed out, self-purchase).
// Centred icon + title + body + single CTA — same anatomy as the screen's
// signed-out block.
function CheckoutGuardStateBase({ icon, title, body, ctaLabel, onCtaPress }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={28} color={colors.textMuted} importantForAccessibility="no" />
      <Text style={styles.title} maxFontSizeMultiplier={2}>{title}</Text>
      <Text style={styles.body} maxFontSizeMultiplier={2}>{body}</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={onCtaPress}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
      >
        <Text style={styles.btnText} maxFontSizeMultiplier={2}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const CheckoutGuardState = React.memo(CheckoutGuardStateBase);
CheckoutGuardState.displayName = 'CheckoutGuardState';
export { CheckoutGuardState };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  body: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: TypographyV2.body.lineHeight,
    color: colors.textMuted,
  },
  btn: {
    marginTop: Space.sm,
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.xl,
    borderRadius: RadiusRoleValue.sheetDialog,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  btnText: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: FontFamily.semibold,
    color: colors.textInverse,
  },
});
