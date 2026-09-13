import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { makeOfferScreenStyles as styles } from './makeOfferScreenStyles';

export interface MakeOfferErrorBlockProps {
  message: string;
  onRetry: () => void;
}

/** Inline error + retry row for MakeOfferScreen — shared between the
 *  compose phase and the review sheet. */
export function MakeOfferErrorBlock({ message, onRetry }: MakeOfferErrorBlockProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.errorBlock}>
      <Text style={[styles.errorText, { color: colors.danger }]}>
        {message}
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.retryBtn,
          { borderColor: colors.danger },
          pressed && { opacity: 0.7 },
        ]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry submitting offer"
      >
        <Ionicons name="refresh-outline" size={15} color={colors.danger} />
        <Text style={[styles.retryBtnText, { color: colors.danger }]}>Retry</Text>
      </Pressable>
    </View>
  );
}
