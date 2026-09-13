import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { Typography } from '../../theme/designTokens';
import { createConvertStyles } from './convertStyles';
import {
  CONVERT_STEP_LABELS,
  getConvertActiveStepIndex,
  type ConvertStep } from './convertViewModels';

interface Props {
  step: ConvertStep;
}

// -- Step indicator --
// Amount → Review → Auth → Done progress rail across the top of the
// convert flow.
export function ConvertStepIndicator({ step }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);

  const activeStepIndex = getConvertActiveStepIndex(step);

  return (
    <View style={styles.stepIndicatorRow}>
      {CONVERT_STEP_LABELS.map((label, index) => {
        const isComplete = index < activeStepIndex;
        const isActive = index === activeStepIndex;
        return (
          <React.Fragment key={label}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: isComplete || isActive ? colors.brand : colors.surfaceAlt,
                    borderColor: isComplete || isActive ? colors.brand : colors.border },
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                ) : (
                  <Text
                    style={[
                      styles.stepDotText,
                      { color: isActive ? colors.textInverse : colors.textMuted },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: isActive ? colors.textPrimary : colors.textMuted,
                    fontFamily: isActive
                      ? Typography.family.semibold
                      : Typography.family.regular },
                ]}
              >
                {label}
              </Text>
            </View>
            {index < CONVERT_STEP_LABELS.length - 1 && (
              <View
                style={[
                  styles.stepConnector,
                  {
                    backgroundColor: index < activeStepIndex ? colors.brand : colors.border },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
