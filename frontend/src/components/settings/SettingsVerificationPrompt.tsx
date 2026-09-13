import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { SettingsRow } from './SettingsRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/** Verification prompt — shows when identity/seller verification is not yet
 *  complete. Email verification alone does not grant a trust badge (P0-UI-3). */
export function SettingsVerificationPrompt() {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const { t: ts } = useAppTranslation('settings');
  const currentUser = useStore((state) => state.currentUser);

  if (currentUser?.identityVerified || currentUser?.sellerVerified) return null;

  return (
    <SettingsRow
      glyph="verified-check"
      iconColor={colors.brand}
      title={ts('verification.promptTitle')}
      subtitle={ts('verification.promptSubtitle')}
      onPress={() => navigation.navigate('Verification')}
      accessibilityLabel={ts('accessibility.verifyIdentity')}
      accessibilityHint={ts('accessibility.verifyIdentityHint')}
    />
  );
}
