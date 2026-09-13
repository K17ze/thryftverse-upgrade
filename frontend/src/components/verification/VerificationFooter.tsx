import React from 'react';
import { Text, Linking } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { SettingsInfoBanner } from '../settings/SettingsInfoBanner';
import { createVerificationScreenStyles } from './verificationScreenStyles';
import { VERIFICATION_GUIDE_URL } from '../../domain/verification';

/**
 * Bottom-of-screen trust banner and the footer note linking to the public
 * verification guide.
 */
export function VerificationFooter() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVerificationScreenStyles(colors), [colors]);
  return (
    <>
      <SettingsInfoBanner
        icon="checkmark-circle-outline"
        text="Verification builds trust with buyers and unlocks higher selling limits. Your data is encrypted and never shared publicly."
      />
      <Text style={[styles.footerNote, { color: colors.textMuted }]}>
        Questions? Read our{' '}
        <Text style={styles.footerLink} onPress={() => Linking.openURL(VERIFICATION_GUIDE_URL)}>
          verification guide
        </Text>
        .
      </Text>
    </>
  );
}
