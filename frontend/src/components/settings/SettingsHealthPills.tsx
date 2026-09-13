import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { createSettingsScreenStyles } from './settingsScreenStyles';

const styles = createSettingsScreenStyles();

/** Account health indicator — compact status pills showing completed
 *  security steps at a glance. Each pill is a checkmark + label. Incomplete
 *  steps are omitted (not shown as red warnings — the verification prompt
 *  above handles that). Renders only when a user is signed in. */
export function SettingsHealthPills() {
  const { colors } = useAppTheme();
  const { t: ts } = useAppTranslation('settings');
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savedAddress = useStore((state) => state.savedAddress);
  const { biometricEnabled } = useSettingsPreferences();

  if (!currentUser) return null;

  return (
    <View style={styles.healthRow}>
      {currentUser.emailVerified ? (
        <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
          <Ionicons name="checkmark-circle" size={13} color={colors.success} />
          <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.emailConfirmed')}</Text>
        </View>
      ) : null}
      {twoFactorEnabled ? (
        <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
          <Ionicons name="checkmark-circle" size={13} color={colors.success} />
          <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.twoFA')}</Text>
        </View>
      ) : null}
      {biometricEnabled ? (
        <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
          <Ionicons name="checkmark-circle" size={13} color={colors.success} />
          <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.biometric')}</Text>
        </View>
      ) : null}
      {savedPaymentMethod ? (
        <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
          <Ionicons name="checkmark-circle" size={13} color={colors.success} />
          <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.payment')}</Text>
        </View>
      ) : null}
      {savedAddress ? (
        <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
          <Ionicons name="checkmark-circle" size={13} color={colors.success} />
          <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.address')}</Text>
        </View>
      ) : null}
    </View>
  );
}
