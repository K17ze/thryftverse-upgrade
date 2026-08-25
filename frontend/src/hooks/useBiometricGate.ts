import { useCallback, useEffect, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';

/**
 * Biometric gate hook for sensitive screens (wallet, payments, account
 * deletion, withdrawals).
 *
 * Uses `expo-local-authentication` which wraps:
 *  - iOS: LocalAuthentication (LAContext) — Face ID / Touch ID / passcode
 *  - Android: BiometricPrompt + FingerprintManager — fingerprint / face / iris
 *
 * OWASP Mobile Top 10 (2024):
 *  - M5 (Insecure Authentication): biometric re-authentication before
 *    sensitive actions raises the bar for session hijack / device theft.
 *
 * Per AGENTS.md §11 (Truthful UI): when biometrics are unavailable, the hook
 * reports `available = false` so screens can fall back to password re-entry
 * rather than fabricating a successful biometric check.
 */

export type BiometricGateStatus =
  | 'pending' // initial check not yet complete
  | 'authenticated' // user passed biometric (or no biometric available → fallback allowed)
  | 'locked' // biometric available but user has not authenticated
  | 'unavailable'; // biometric not available and no fallback possible yet

export interface UseBiometricGateResult {
  /** Current gate status. Screens render content only when `authenticated`. */
  status: BiometricGateStatus;
  /** True if the device has enrolled biometric hardware and the user has set it up. */
  isAvailable: boolean;
  /** True while an authentication prompt is on screen. */
  isAuthenticating: boolean;
  /** Last authentication error message (human-readable), if any. */
  error: string | null;
  /** Trigger the native biometric prompt. Resolves true on success. */
  authenticate: (reason?: string) => Promise<boolean>;
  /** Reset the gate back to `locked` (e.g. on app blur / focus loss). */
  reset: () => void;
}

const DEFAULT_REASON = 'Authenticate to continue';

export function useBiometricGate(): UseBiometricGateResult {
  const { biometricEnabled } = useSettingsPreferences();
  const [status, setStatus] = useState<BiometricGateStatus>('pending');
  const [isAvailable, setIsAvailable] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Probe hardware availability once on mount. If the user has disabled
  // biometric gating in Settings, the gate reports `unavailable` so screens
  // reveal content with a truthful warning instead of prompting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!biometricEnabled) {
          // User opted out of biometric gating — treat as unavailable so
          // screens fall back to password / no-gate rather than prompting.
          if (cancelled) return;
          setIsAvailable(false);
          setStatus('unavailable');
          return;
        }
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const available = hasHardware && enrolled;
        if (cancelled) return;
        setIsAvailable(available);
        if (available) {
          setStatus('locked');
        } else {
          // No biometric available — screens decide their own fallback.
          // We expose `unavailable` so the screen can show content with a
          // warning or require password re-entry rather than blocking forever.
          setStatus('unavailable');
        }
      } catch {
        if (cancelled) return;
        setIsAvailable(false);
        setStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [biometricEnabled]);

  const authenticate = useCallback(
    async (reason: string = DEFAULT_REASON): Promise<boolean> => {
      if (Platform.OS === 'web') {
        // No biometric on web — allow through with a truthful "unavailable".
        setStatus('authenticated');
        return true;
      }
      if (!isAvailable) {
        // Cannot authenticate without enrolled biometrics. Surface as a
        // failure so the caller can fall back to password re-entry.
        setStatus('unavailable');
        return false;
      }
      setIsAuthenticating(true);
      setError(null);
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: reason,
          fallbackLabel: 'Use password',
          disableDeviceFallback: false,
          cancelLabel: 'Cancel',
        });
        setIsAuthenticating(false);
        if (result.success) {
          setStatus('authenticated');
          return true;
        }
        // User cancelled or authentication failed.
        const message =
          result.error === 'user_cancel'
            ? 'Authentication cancelled'
            : result.error === 'user_fallback'
              ? 'Password fallback selected'
              : 'Authentication failed';
        setError(message);
        setStatus('locked');
        return false;
      } catch (err) {
        setIsAuthenticating(false);
        const message = err instanceof Error ? err.message : 'Authentication failed';
        setError(message);
        setStatus('locked');
        return false;
      }
    },
    [isAvailable]
  );

  const reset = useCallback(() => {
    setError(null);
    setStatus(isAvailable ? 'locked' : 'unavailable');
  }, [isAvailable]);

  return { status, isAvailable, isAuthenticating, error, authenticate, reset };
}

/**
 * Standalone helpers (usable outside the hook for one-off checks).
 */

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function biometricTypesSupported(): Promise<
  LocalAuthentication.AuthenticationType[]
> {
  if (Platform.OS === 'web') return [];
  try {
    return await LocalAuthentication.supportedAuthenticationTypesAsync();
  } catch {
    return [];
  }
}
