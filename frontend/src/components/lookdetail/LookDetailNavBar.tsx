import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Control } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

export interface LookDetailNavBarProps {
  onBack: () => void;
  /** When provided, the "more options" button renders (loaded state over
   *  media). Omitted on the loading / error fallbacks, which show back only. */
  onOverflow?: () => void;
  /** Glyph color — 'textPrimary' over the solid fallbacks, the scrim color
   *  token value when floating over hero media. */
  iconColor: keyof ThemeColors | string;
}

/**
 * Floating Header — transparent 44pt hit targets; glyph legibility from the
 * text-shadow scrim. No circular chrome. Back + overflow only.
 * Share lives in the social action rail (LookSocialActions) — not
 * duplicated in the header. The three-dots overflow is shown to ALL
 * users (context-aware contents), matching Instagram/Pinterest/TikTok
 * where every viewer can access secondary actions.
 */
function LookDetailNavBarImpl({ onBack, onOverflow, iconColor }: LookDetailNavBarProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.headerRow}>
      <AnimatedPressable
        style={onOverflow ? styles.backBtn : styles.backBtnSolid}
        onPress={onBack}
        activeOpacity={0.85}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <AppIcon name="back" size={IconSize.lg} color={iconColor} opticalCenter accessible={false} glyphStyle={styles.headerGlyph} />
      </AnimatedPressable>
      {onOverflow ? (
        <AnimatedPressable
          style={styles.headerBtn}
          onPress={onOverflow}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="More options"
          accessibilityHint="Open the look options menu"
        >
          <AppIcon name="more" size={IconSize.lg} color={iconColor} opticalCenter accessible={false} glyphStyle={styles.headerGlyph} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

export const LookDetailNavBar = React.memo(LookDetailNavBarImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    headerRow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.sm,
      paddingTop: Space.sm,
      zIndex: 10 },
    backBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    headerBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    backBtnSolid: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    headerGlyph: {
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4 } });
}
