import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { ManualDispatchForm, type ManualDispatchFormProps } from './ManualDispatchForm';
import { createSellerFulfilmentStyles } from './sellerFulfilmentScreenStyles';

export interface ManualDispatchSectionProps extends ManualDispatchFormProps {
  /** True when integrated label generation is unavailable and this manual
   *  form is the fallback path rather than the purchased mode. */
  labelGenerationUnavailable: boolean;
  labelError: string | null;
}

/**
 * Manual mode OR label generation unavailable. The carrier picker +
 * tracking input is the primary content, not a secondary section. When
 * label generation is unavailable, the error is shown above the manual
 * form as the alternative path.
 */
export function ManualDispatchSection({
  labelGenerationUnavailable,
  labelError,
  ...formProps
}: ManualDispatchSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerFulfilmentStyles(colors), [colors]);

  return (
    <View style={styles.actionSection}>
      {labelGenerationUnavailable && labelError && (
        <View style={styles.labelErrorInline}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} aria-hidden={true} />
          <Text style={styles.labelErrorText}>{labelError}</Text>
        </View>
      )}
      {labelGenerationUnavailable && (
        <Text style={styles.manualAltHint}>
          Integrated label unavailable. Arrange a tracked service below.
        </Text>
      )}
      <ManualDispatchForm {...formProps} />
    </View>
  );
}
