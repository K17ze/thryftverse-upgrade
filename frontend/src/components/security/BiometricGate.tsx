import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Typography } from '../../theme/designTokens';
import { AppButton } from '../ui/AppButton';
import { useBiometricGate, type UseBiometricGateResult } from '../../hooks/useBiometricGate';
import { haptics } from '../../utils/haptics';

/**
 * Biometric gate for sensitive screens (wallet, payments, account deletion,
 * withdrawals).
 *
 * OWASP Mobile Top 10 (2024) — M5: Insecure Authentication.
 *
 * Screens with multiple early-return states should use `useBiometricGate`
 * directly and render `<BiometricGatePrompt>` for the locked/pending state,
 * then fall through to their existing render when authenticated/unavailable.
 * Screens with a single render tree can use `<BiometricGate>` as a wrapper.
 *
 * Per AGENTS.md §11 (Truthful UI): when biometrics are unavailable, content is
 * revealed with a truthful warning — we never claim a biometric check passed
 * when none ran.
 */

export interface BiometricGatePromptProps {
  gate: UseBiometricGateResult;
  reason?: string;
  header?: React.ReactNode;
  onBack?: () => void;
}

/**
 * Presentational prompt for the locked / pending state.
 * Renders the screen header above the auth UI so the back button stays usable.
 */
export function BiometricGatePrompt({
  gate,
  reason = 'Authenticate to continue',
  header,
  onBack,
}: BiometricGatePromptProps) {
  const { colors } = useAppTheme();

  const handleRetry = useCallback(() => {
    haptics.tap();
    void gate.authenticate(reason);
  }, [gate, reason]);

  const handleCancel = useCallback(() => {
    haptics.tap();
    onBack?.();
  }, [onBack]);

  // Pending: still probing hardware availability.
  if (gate.status === 'pending') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      </View>
    );
  }

  // Locked: biometric available, awaiting authentication.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={32}
          color={colors.textPrimary}
          style={styles.icon}
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Authenticate to continue
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {gate.isAuthenticating
            ? 'Waiting for biometric verification…'
            : gate.error
              ? gate.error
              : 'This screen contains sensitive information. Verify with Face ID, Touch ID, or fingerprint to continue.'}
        </Text>
        {!gate.isAuthenticating && (
          <View style={styles.actions}>
            <AppButton
              title="Authenticate"
              onPress={handleRetry}
              variant="primary"
              style={styles.actionBtn}
            />
            {onBack && (
              <AppButton
                title="Go back"
                onPress={handleCancel}
                variant="secondary"
                style={styles.actionBtn}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export interface BiometricGateProps {
  reason?: string;
  children: React.ReactNode;
  header?: React.ReactNode;
  onBack?: () => void;
}

/**
 * Convenience wrapper for screens with a single render tree.
 * Auto-prompts on mount and reveals `children` once authenticated.
 */
export function BiometricGate({
  reason = 'Authenticate to continue',
  children,
  header,
  onBack,
}: BiometricGateProps) {
  const gate = useBiometricGate();
  const { colors } = useAppTheme();
  const { status, isAuthenticating, authenticate } = gate;

  useEffect(() => {
    if (status === 'locked' && !isAuthenticating) {
      void authenticate(reason);
    }
  }, [status, isAuthenticating, authenticate, reason]);

  if (status === 'pending' || status === 'locked') {
    return (
      <BiometricGatePrompt gate={gate} reason={reason} header={header} onBack={onBack} />
    );
  }

  // Unavailable: reveal content with a truthful warning banner.
  if (status === 'unavailable') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <View
          style={[
            styles.warningBanner,
            {
              backgroundColor: colors.warningSubtle,
              borderColor: colors.warningBorder,
            },
          ]}
        >
          <Ionicons name="shield-outline" size={16} color={colors.warning} />
          <Text style={[styles.warningText, { color: colors.textSecondary }]}>
            Biometric protection is not set up on this device. Use a strong
            password and keep your device locked.
          </Text>
        </View>
        {children}
      </View>
    );
  }

  // Authenticated: reveal sensitive content.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
  },
  icon: {
    marginBottom: Space.md,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
    marginBottom: Space.xs,
  },
  subtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.lg,
    maxWidth: 320,
  },
  actions: {
    flexDirection: 'column',
    gap: Space.sm,
    width: 260,
    maxWidth: '100%',
  },
  actionBtn: {
    width: '100%',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  warningText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
});
