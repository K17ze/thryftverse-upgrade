import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface SettingsAccountSectionProps {
  /** Whether the device has enrolled biometric hardware (drives toggle
   *  subtitles and disabled state). */
  isBiometricAvailable: boolean;
}

/** YOUR ACCOUNT — profile, security, privacy rows. */
export function SettingsAccountSection({ isBiometricAvailable }: SettingsAccountSectionProps) {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const { t: ts } = useAppTranslation('settings');
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const blockedCount = useStore((s) => s.blockedUsers.length);
  const {
    biometricEnabled,
    setBiometricEnabled,
    biometricLoginEnabled,
    setBiometricLoginEnabled,
    autoTranslateMessages,
    setAutoTranslateMessages } = useSettingsPreferences();

  return (
    <SettingsSection title={ts('sections.yourAccount')}>
      <SettingsRow
        glyph="verified-check"
        iconColor={currentUser?.identityVerified || currentUser?.sellerVerified ? colors.success : colors.textMuted}
        titleStyle={currentUser?.identityVerified || currentUser?.sellerVerified ? { color: colors.success } : undefined}
        title={ts('rows.verification')}
        subtitle={currentUser?.sellerVerified ? ts('verification.trustedSeller') : currentUser?.identityVerified ? ts('verification.idVerified') : ts('verification.getBadge')}
        onPress={() => navigation.navigate('Verification')}
        isFirst
      />
      <SettingsRow
        glyph="security-lock"
        title={ts('rows.changePassword')}
        subtitle={twoFactorEnabled ? ts('rows.twoFAEnabled') : ts('rows.passwordOnly')}
        onPress={() => navigation.navigate('ChangePassword')}
      />
      <SettingsRow
        glyph="security-lock"
        title={ts('rows.biometricLock')}
        subtitle={
          !isBiometricAvailable
            ? ts('rows.biometricNotAvailable')
            : biometricEnabled
              ? ts('rows.biometricEnabled')
              : ts('rows.biometricDisabled')
        }
        toggleValue={biometricEnabled && isBiometricAvailable}
        onToggle={(v) => setBiometricEnabled(v)}
        disabled={!isBiometricAvailable}
      />
      <SettingsRow
        glyph="security-lock"
        title={ts('rows.biometricLogin')}
        subtitle={
          !isBiometricAvailable
            ? ts('rows.biometricNotAvailable')
            : biometricLoginEnabled
              ? ts('rows.biometricLoginEnabled')
              : ts('rows.biometricLoginDisabled')
        }
        toggleValue={biometricLoginEnabled && isBiometricAvailable}
        onToggle={(v) => setBiometricLoginEnabled(v)}
        disabled={!isBiometricAvailable}
      />
      <SettingsRow
        glyph="connection-link"
        title={ts('rows.connectedAccounts')}
        subtitle={ts('rows.connectedAccountsSubtitle')}
        onPress={() => navigation.navigate('ConnectedAccounts')}
      />
      <SettingsRow
        glyph="history-clock"
        title={ts('rows.devicesSessions')}
        onPress={() => navigation.navigate('ActiveSessions')}
      />
      <SettingsRow
        glyph="security-lock"
        title={ts('rows.accountControl')}
        subtitle={ts('rows.accountControlSubtitle')}
        onPress={() => navigation.navigate('AccountControl')}
      />
      <SettingsRow
        icon="download"
        title={ts('rows.downloadData')}
        subtitle={ts('rows.downloadDataSubtitle')}
        onPress={() => navigation.navigate('DataExport')}
      />
      <SettingsRow
        icon="eye"
        title={ts('rows.privacySafety')}
        subtitle={ts('rows.privacySafetySubtitle')}
        onPress={() => navigation.navigate('PrivacySettings')}
      />
      <SettingsRow
        icon="chat"
        title={ts('rows.chatPrivacy')}
        subtitle={ts('rows.chatPrivacySubtitle')}
        onPress={() => navigation.navigate('ChatSettings')}
      />
      <SettingsRow
        glyph="language-globe"
        title={ts('rows.autoTranslate')}
        subtitle={
          autoTranslateMessages
            ? ts('rows.autoTranslateEnabled')
            : ts('rows.autoTranslateDisabled')
        }
        toggleValue={autoTranslateMessages}
        onToggle={(v) => setAutoTranslateMessages(v)}
      />
      <SettingsRow
        glyph="security-lock"
        title={ts('rows.dataPrivacy')}
        subtitle={ts('rows.dataPrivacySubtitle')}
        onPress={() => navigation.navigate('DataPrivacy')}
      />
      <SettingsRow
        icon="ban"
        title={ts('rows.blockedUsers')}
        subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None'}
        onPress={() => navigation.navigate('BlockedUsers')}
        isLast
      />
    </SettingsSection>
  );
}
