/**
 * COPPA age gate component.
 *
 * Provides a modal-based age verification flow that complies with COPPA
 * (Children's Online Privacy Protection Act) and similar regulations.
 * Verification is stored in MMKV with a timestamp and re-checked every
 * 30 days.
 *
 * Two modes:
 *   - 'soft': Shows a warning but allows the user to proceed.
 *   - 'hard': Blocks access entirely if the user is under the minimum age.
 *
 * @example
 * ```tsx
 * const { showGate } = useAgeGate();
 * if (showGate) {
 *   return <AgeGate onVerified={() => setVerified(true)} mode="hard" />;
 * }
 * ```
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  AccessibilityRole,
} from 'react-native';
import { appStorage } from '../../storage/mmkv';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';

const STORAGE_KEY = '@thryftverse/age_gate_verified';
const STORAGE_TIMESTAMP_KEY = '@thryftverse/age_gate_verified_at';
const RECHECK_INTERVAL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AgeGateMode = 'soft' | 'hard';

export interface AgeGateProps {
  /** Called when the user successfully verifies their age. */
  onVerified: () => void;
  /** Minimum age required (default: 13). */
  minAge?: number;
  /** 'soft' shows a warning but allows access; 'hard' blocks under-age users. */
  mode?: AgeGateMode;
  /** Whether the modal is visible. Defaults to true. */
  visible?: boolean;
}

interface StoredVerification {
  verified: boolean;
  timestamp: number;
  birthYear: number | null;
}

function readStoredVerification(): StoredVerification | null {
  try {
    const verified = appStorage.getBoolean(STORAGE_KEY);
    const timestamp = appStorage.getNumber(STORAGE_TIMESTAMP_KEY);
    if (verified === undefined || timestamp === undefined) return null;
    return { verified, timestamp, birthYear: null };
  } catch {
    return null;
  }
}

function writeStoredVerification(birthYear: number | null): void {
  try {
    appStorage.set(STORAGE_KEY, true);
    appStorage.set(STORAGE_TIMESTAMP_KEY, Date.now());
  } catch {
    // Storage may be full — verification is still in React state.
  }
}

function clearStoredVerification(): void {
  try {
    appStorage.remove(STORAGE_KEY);
    appStorage.remove(STORAGE_TIMESTAMP_KEY);
  } catch {
    // Best-effort.
  }
}

function isVerificationStale(timestamp: number): boolean {
  return Date.now() - timestamp > RECHECK_INTERVAL_DAYS * MS_PER_DAY;
}

/**
 * Hook that manages age gate verification state.
 *
 * Returns:
 *   - `isVerified`: whether the user has a valid (non-stale) verification.
 *   - `showGate`: whether the gate should be displayed.
 *   - `verify`: function to record a successful verification.
 *   - `reset`: function to clear verification (for testing or logout).
 */
export function useAgeGate(minAge: number = 13): {
  isVerified: boolean;
  showGate: boolean;
  verify: (birthYear?: number) => void;
  reset: () => void;
} {
  const [isVerified, setIsVerified] = useState<boolean>(() => {
    const stored = readStoredVerification();
    if (!stored) return false;
    if (!stored.verified) return false;
    if (isVerificationStale(stored.timestamp)) return false;
    return true;
  });

  const verify = useCallback((birthYear?: number) => {
    writeStoredVerification(birthYear ?? null);
    setIsVerified(true);
  }, []);

  const reset = useCallback(() => {
    clearStoredVerification();
    setIsVerified(false);
  }, []);

  return {
    isVerified,
    showGate: !isVerified,
    verify,
    reset,
  };
}

export function AgeGate({
  onVerified,
  minAge = 13,
  mode = 'hard',
  visible = true,
}: AgeGateProps): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 100; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const userAge = useMemo(() => {
    if (selectedYear === null) return null;
    return currentYear - selectedYear;
  }, [selectedYear, currentYear]);

  const canProceed = useMemo(() => {
    if (mode === 'soft') return confirmed || userAge !== null;
    return userAge !== null && userAge >= minAge;
  }, [mode, confirmed, userAge, minAge]);

  const handleVerify = useCallback(() => {
    if (mode === 'soft' && userAge !== null && userAge < minAge) {
      setShowWarning(true);
      return;
    }
    if (!canProceed) return;
    writeStoredVerification(selectedYear);
    onVerified();
  }, [mode, userAge, minAge, canProceed, selectedYear, onVerified]);

  const handleConfirmOnly = useCallback(() => {
    setConfirmed(true);
    writeStoredVerification(null);
    onVerified();
  }, [onVerified]);

  useEffect(() => {
    if (!visible) return;
    const stored = readStoredVerification();
    if (stored && stored.verified && !isVerificationStale(stored.timestamp)) {
      onVerified();
    }
  }, [visible, onVerified]);

  if (!visible) return null;

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Space.lg,
    },
    container: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 28,
      width: '100%',
      maxWidth: 400,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Space.lg,
      lineHeight: 21,
    },
    yearScroll: {
      maxHeight: 180,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      marginBottom: 20,
    },
    yearItem: {
      paddingVertical: 14,
      paddingHorizontal: Space.md,
      alignItems: 'center',
    },
    yearItemSelected: {
      backgroundColor: colors.brandSubtle,
    },
    yearText: {
      fontSize: 17,
      color: colors.textPrimary,
    },
    yearTextSelected: {
      fontWeight: '600',
      color: colors.brand,
    },
    confirmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      borderColor: colors.brand,
      backgroundColor: colors.brand,
    },
    confirmText: {
      fontSize: 15,
      color: colors.textPrimary,
      flex: 1,
    },
    button: {
      backgroundColor: colors.brand,
      paddingVertical: Space.md,
      borderRadius: 14,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.4,
    },
    buttonText: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textInverse,
    },
    warning: {
      backgroundColor: colors.warningSubtle,
      borderRadius: Radius.lg,
      padding: Space.md,
      marginBottom: Space.md,
    },
    warningText: {
      fontSize: 14,
      color: colors.warning,
      textAlign: 'center',
    },
    ageLabel: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 8,
    },
  });

  const alertRole: AccessibilityRole = 'alert';

  return (
    <Modal visible={visible} transparent animationType="fade" accessible accessibilityRole={alertRole}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Age Verification</Text>
          <Text style={styles.subtitle}>
            ThryftVerse is a marketplace for users {minAge} and older. Please
            confirm your age to continue.
          </Text>

          {showWarning && mode === 'soft' && (
            <View style={styles.warning}>
              <Text style={styles.warningText}>
                You are under {minAge}. Access is allowed but some features
                may be restricted.
              </Text>
            </View>
          )}

          <Text style={styles.ageLabel}>Select your year of birth</Text>
          <View style={styles.yearScroll}>
            {yearOptions.slice(0, 50).map((year) => {
              const isSelected = selectedYear === year;
              return (
                <Pressable
                  key={year}
                  style={[styles.yearItem, isSelected && styles.yearItemSelected]}
                  onPress={() => setSelectedYear(year)}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Born in ${year}`}
                >
                  <Text
                    style={[
                      styles.yearText,
                      isSelected && styles.yearTextSelected,
                    ]}
                  >
                    {year}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={styles.confirmRow}
            onPress={() => setConfirmed(!confirmed)}
            accessible
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            accessibilityLabel={`I confirm I am ${minAge} or older`}
          >
            <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
              {confirmed && (
                <Text style={{ color: colors.textInverse, fontSize: 16, fontWeight: '700' }}>
                  ✓
                </Text>
              )}
            </View>
            <Text style={styles.confirmText}>
              I confirm I am {minAge} or older
            </Text>
          </Pressable>

          <Pressable
            style={[styles.button, !canProceed && !confirmed && styles.buttonDisabled]}
            onPress={confirmed ? handleConfirmOnly : handleVerify}
            disabled={!canProceed && !confirmed}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
