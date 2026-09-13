import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  onClose: () => void;
  closeAccessibilityLabel: string;
}

function CheckoutHeaderBase({ onClose, closeAccessibilityLabel }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.header}>
      <Pressable
        style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={closeAccessibilityLabel}
      >
        <Ionicons name="close" size={22} color={colors.textPrimary} importantForAccessibility="no" />
      </Pressable>
      <Text style={styles.headerTitle} maxFontSizeMultiplier={2} accessibilityRole="header">Checkout</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const CheckoutHeader = React.memo(CheckoutHeaderBase);
CheckoutHeader.displayName = 'CheckoutHeader';
export { CheckoutHeader };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingTop: 0,
  },
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    opacity: 0.5,
  },
  headerTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: Control.hit,
  },
});
