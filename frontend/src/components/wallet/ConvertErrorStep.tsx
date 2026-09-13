import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '../ui/AppButton';
import { useAppTheme } from '../../theme/ThemeContext';
import { createConvertStyles } from './convertStyles';

interface Props {
  errorMessage: string;
  onTryAgain: () => void;
  onCancel: () => void;
}

// ERROR STATE — failed conversion with try-again / cancel recovery.
export function ConvertErrorStep({ errorMessage, onTryAgain, onCancel }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);

  return (
    <View
      style={styles.centeredStep}
    >
      <Ionicons name="close-circle-outline" size={56} color={colors.danger} style={styles.stepIcon} />
      <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
        Conversion failed
      </Text>
      <Text
        style={[styles.stepSubtitle, { color: colors.textSecondary }]}
        numberOfLines={4}
      >
        {errorMessage}
      </Text>
      <View style={styles.authActions}>
        <AppButton
          title="Try again"
          onPress={onTryAgain}
          variant="primary"
          style={styles.authActionBtn}
          accessibilityLabel="Try the conversion again"
          accessibilityHint="Returns to the review step"
        />
        <AppButton
          title="Cancel"
          onPress={onCancel}
          variant="secondary"
          style={styles.authActionBtn}
          accessibilityLabel="Cancel and go back"
          accessibilityHint="Returns to the amount step"
        />
      </View>
    </View>
  );
}
