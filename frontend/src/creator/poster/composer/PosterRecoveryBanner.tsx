/**
 * PosterRecoveryBanner — inline crash-recovery notice for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no visual or
 * behavioral change). Presentational only: visibility is decided by the
 * parent (`hasPendingRecovery && <PosterRecoveryBanner />`); all actions
 * arrive as props.
 */
import React from 'react';
import { View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The subset of the screen's StyleSheet styles the banner renders. The
 * parent passes its full `styles` object; only these keys are read.
 */
export interface PosterRecoveryBannerStyles {
  recoveryBanner: ViewStyle;
  recoveryText: TextStyle;
  recoveryBtn: ViewStyle;
  recoveryBtnText: TextStyle;
  recoveryDismiss: ViewStyle;
}

export interface PosterRecoveryBannerProps {
  /** Screen styles (the parent's full createStyles() object). */
  styles: PosterRecoveryBannerStyles;
  /** Theme colors. */
  colors: ThemeColors;
  /** Restores the crashed/unsaved project into the editor. */
  recoverCrashedProject: () => Promise<void>;
  /** Dismisses the recovery offer. */
  dismissRecovery: () => void;
}

export function PosterRecoveryBanner({
  styles,
  colors,
  recoverCrashedProject,
  dismissRecovery,
}: PosterRecoveryBannerProps) {
  return (
    <View style={[styles.recoveryBanner, { borderLeftColor: colors.brand }]}>
      <Ionicons name="alert-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
      <Text style={[styles.recoveryText, { color: colors.scrimTextPrimary }]}>Recover unsaved project?</Text>
      <PressScale
        onPress={() => { void recoverCrashedProject(); }}
        style={styles.recoveryBtn}
        accessibilityLabel="Recover project"
        accessibilityHint="Restores the unsaved project"
        accessibilityRole="button"
      >
        <Text style={[styles.recoveryBtnText, { color: colors.brand }]}>Recover</Text>
      </PressScale>
      <PressScale
        onPress={dismissRecovery}
        style={styles.recoveryDismiss}
        accessibilityLabel="Dismiss recovery prompt"
        accessibilityHint="Discards the recovery offer"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
      </PressScale>
    </View>
  );
}
