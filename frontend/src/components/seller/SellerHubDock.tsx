import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, DockConstants, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

export interface SellerHubDockProps {
  onListNewPiece: () => void;
}

/**
 * SellerHubDock — the sticky primary action pinned outside the scroll.
 * Extracted so SellerHubScreen stays a lean orchestrator; behavior and
 * feedback (medium haptic, 0.97 press) are unchanged.
 */
export const SellerHubDock: React.FC<SellerHubDockProps> = ({ onListNewPiece }) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.primaryDock, { paddingBottom: Math.max(Space.lg, insets.bottom + Space.sm) }]}
    >
      <AnimatedPressable
        style={[styles.primaryActionBtn, { backgroundColor: colors.brand }]}
        onPress={onListNewPiece}
        activeOpacity={0.8}
        scaleValue={0.97}
        hapticFeedback="medium"
        accessibilityRole="button"
        accessibilityLabel="List a new piece"
      >
        <AppIcon concept="add" size={IconSize.sm} color="textInverse" opticalCenter accessible={false} />
        <Text style={[styles.primaryActionText, { color: colors.textInverse }]}>List new piece</Text>
      </AnimatedPressable>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    primaryDock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: Space.md,
      paddingBottom: Space.lg,
    },
    primaryActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      height: DockConstants.primaryButtonHeight,
      borderRadius: Radius.full,
      ...Elevation.card,
    },
    primaryActionText: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      fontFamily: FontFamily.bold,
    },
  });
}
