import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '../ui/AppButton';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { createConvertStyles } from './convertStyles';

interface Props {
  isAuthenticating: boolean;
  error: string | null;
  onRetryAuth: () => void;
  onCancelAuth: () => void;
}

// STEP 3: AUTHENTICATING — biometric gate prompt with retry / cancel.
export function ConvertAuthStep({
  isAuthenticating,
  error,
  onRetryAuth,
  onCancelAuth,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);

  return (
    <View
      style={styles.centeredStep}
    >
      <Ionicons name="lock-closed-outline" size={48} color={colors.textPrimary} style={styles.stepIcon} />
      <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
        Authenticate to continue
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {isAuthenticating
          ? 'Waiting for biometric verification…'
          : error
            ? error
            : 'Verify with Face ID, Touch ID, or fingerprint to authorise this conversion.'}
      </Text>
      {!isAuthenticating && (
        <View style={styles.authActions}>
          <AppButton
            title="Authenticate"
            onPress={onRetryAuth}
            variant="primary"
            style={styles.authActionBtn}
            accessibilityLabel="Retry biometric authentication"
            accessibilityHint="Triggers the biometric prompt again"
          />
          <AppButton
            title="Cancel"
            onPress={onCancelAuth}
            variant="secondary"
            style={styles.authActionBtn}
            accessibilityLabel="Cancel authentication"
            accessibilityHint="Returns to the review step"
          />
        </View>
      )}
      {isAuthenticating && (
        <ActivityIndicator
          color={colors.textMuted}
          style={{ marginTop: Space.lg }}
        />
      )}
    </View>
  );
}
