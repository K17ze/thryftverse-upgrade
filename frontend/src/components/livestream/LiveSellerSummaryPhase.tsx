/**
 * LiveSellerSummaryPhase — post-stream summary for the seller: real
 * viewer count, lots sold and total sales collected while live.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipMetricLine } from '../flagship';
import { useSellerStyles } from './liveSellerStyles';

interface LiveSellerSummaryPhaseProps {
  viewerCount: number;
  lotsSold: number;
  totalSalesMinor: number;
  onDone: () => void;
  onBack: () => void;
}

export function LiveSellerSummaryPhase({
  viewerCount,
  lotsSold,
  totalSalesMinor,
  onDone,
  onBack }: LiveSellerSummaryPhaseProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const styles = useSellerStyles();

  return (
    <FlagshipScreen
      testID="live-seller-summary"
      header={<FlagshipHeader title="Stream ended" onBack={onBack} />}
      scrollEnabled={false}
      contentStyle={styles.flushContent}
    >
      <View style={styles.summaryWrap}>
        <AppIcon name="check" variant="filled" size={IconSize.display} color="success" accessible={false} />
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]} accessibilityRole="header">
          Stream ended
        </Text>
        <View style={styles.summaryStats}>
          <FlagshipMetricLine
            label="Viewers"
            value={String(viewerCount)}
            separated
          />
          <FlagshipMetricLine
            label="Lots sold"
            value={String(lotsSold)}
            separated
          />
          <FlagshipMetricLine
            label="Total sales"
            value={formatFromFiat(totalSalesMinor / 100, 'GBP') ?? ''}
            separated
          />
        </View>
        <AnimatedPressable
          onPress={onDone}
          style={[styles.goLiveBtn, { backgroundColor: colors.brand }]}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={[styles.goLiveBtnText, { color: colors.textInverse }]}>Done</Text>
        </AnimatedPressable>
      </View>
    </FlagshipScreen>
  );
}
