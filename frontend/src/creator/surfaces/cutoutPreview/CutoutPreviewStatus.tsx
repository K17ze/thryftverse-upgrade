/**
 * CutoutPreviewStatus — the "cutout unavailable" and error+retry message
 * blocks of CutoutPreviewSheet. Extracted verbatim.
 */
import React from 'react';
import { View, Text } from 'react-native';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import type { CutoutCapability } from '../../core/cutout/CutoutService';
import { styles } from './cutoutPreviewStyles';

interface CutoutPreviewStatusProps {
  capability: CutoutCapability | null;
  processing: boolean;
  error: string | null;
  onRetry: () => void;
  colors: ThemeColors;
}

export function CutoutPreviewStatus({
  capability,
  processing,
  error,
  onRetry,
  colors }: CutoutPreviewStatusProps) {
  return (
    <>
      {capability && !capability.brushRefinement && (
        <View style={styles.messageContainer}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
            Cutout unavailable
          </Text>
          <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
            Brush cutout requires Skia, which isn&rsquo;t linked in this build.
          </Text>
        </View>
      )}

      {capability?.brushRefinement && !processing && error && (
        <View style={styles.messageContainer}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
            Could not initialise the cutout
          </Text>
          <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
            {error}
          </Text>
          <PressScale
            onPress={onRetry}
            style={[styles.retryBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Retry cutout"
            accessibilityHint="Attempts to create the brush mask again"
            accessibilityRole="button"
          >
            <Text style={[styles.retryBtnText, { color: colors.textInverse }]}>
              Retry
            </Text>
          </PressScale>
        </View>
      )}
    </>
  );
}
