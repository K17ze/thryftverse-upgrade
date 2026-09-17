import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { lookComposerStyles as styles } from '../LookComposerStyles';

// ── Crash recovery banner (presentational) ──────────────────────────
// Extracted from LookComposerScreen — pure relocation, no changes.
export function LookRecoveryBanner({
  hasPendingRecovery,
  recoverCrashedProject,
  dismissRecovery,
  colors }: {
  hasPendingRecovery: boolean;
  recoverCrashedProject: CreatorContextValue['recoverCrashedProject'];
  dismissRecovery: CreatorContextValue['dismissRecovery'];
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <>
      {/* ── Crash recovery banner ──────────────────────────────────── */}
      {/* When a pending crash journal entry is detected, show a recovery
          prompt at the top of the composer. The user can recover the
          last saved project or dismiss the prompt. */}
      {hasPendingRecovery && (
        <View style={[styles.recoveryBanner, { borderLeftColor: colors.brand, backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="alert-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
          <Text style={[styles.recoveryText, { color: colors.textPrimary }]}>Recover draft?</Text>
          <PressScale
            onPress={() => { void recoverCrashedProject(); }}
            style={[styles.recoveryBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Recover project"
            accessibilityHint="Restores the unsaved project"
            accessibilityRole="button"
          >
            <Text style={[styles.recoveryBtnText, { color: colors.textInverse }]}>Recover</Text>
          </PressScale>
          <PressScale
            onPress={dismissRecovery}
            style={styles.recoveryDismiss}
            accessibilityLabel="Dismiss recovery prompt"
            accessibilityHint="Discards the recovery offer"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={IconGrammar.metadata} color={colors.textSecondary} />
          </PressScale>
        </View>
      )}
    </>
  );
}
