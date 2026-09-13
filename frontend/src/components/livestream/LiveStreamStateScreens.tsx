/**
 * LiveStreamStateScreens — the three non-live states of the viewer:
 * connecting (skeleton matching the live layout), error (with offline
 * variant), and ended (with the stream-end summary from the contract).
 * Each is a full FlagshipScreen — the live stage itself never uses one.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  FlagshipMetricLine,
  SkeletonBlock,
  SkeletonTextLine } from '../flagship';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { StreamEndEventPayload } from '../../services/liveShoppingApi';

interface ConnectingProps {
  isOffline: boolean;
  onBack: () => void;
  onRetry: () => void;
}

export function LiveStreamConnectingScreen({ isOffline, onBack, onRetry }: ConnectingProps) {
  const { colors } = useAppTheme();
  const { height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, screenHeight), [colors, screenHeight]);
  const { t } = useAppTranslation('liveStreamViewer');

  return (
    <FlagshipScreen
      header={<FlagshipHeader title={t('live.label')} onBack={onBack} />}
      scrollEnabled={false}
      contentStyle={styles.stateFlush}
    >
      <FlagshipState
        variant={isOffline ? 'offline' : 'loading'}
        title={isOffline ? undefined : t('connecting.title')}
        subtitle={isOffline ? undefined : t('connecting.subtitle')}
        skeleton={isOffline ? undefined : (
          <View style={styles.connectSkeleton}>
            <SkeletonBlock width="100%" height={screenHeight * 0.42} radius={Radius.none} />
            <View style={styles.connectSkeletonChat}>
              <SkeletonTextLine width="70%" height={12} />
              <SkeletonTextLine width="52%" height={12} />
              <SkeletonTextLine width="64%" height={12} />
            </View>
            <SkeletonBlock width="100%" height={56} radius={Radius.lg} />
          </View>
        )}
        actionLabel={isOffline ? t('error.reconnect') : undefined}
        onAction={isOffline ? onRetry : undefined}
      />
    </FlagshipScreen>
  );
}

export function LiveStreamErrorScreen({ isOffline, onBack, onRetry }: ConnectingProps) {
  const { colors } = useAppTheme();
  const { height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, screenHeight), [colors, screenHeight]);
  const { t } = useAppTranslation('liveStreamViewer');

  return (
    <FlagshipScreen
      header={<FlagshipHeader title={t('live.label')} onBack={onBack} />}
      scrollEnabled={false}
      contentStyle={styles.stateFlush}
    >
      <FlagshipState
        variant={isOffline ? 'offline' : 'error'}
        title={t('error.title')}
        subtitle={t('error.subtitle')}
        actionLabel={t('error.reconnect')}
        onAction={onRetry}
        secondaryActionLabel={t('error.goBack')}
        onSecondaryAction={onBack}
      />
    </FlagshipScreen>
  );
}

interface EndedProps {
  summary: StreamEndEventPayload | null;
  onBack: () => void;
}

export function LiveStreamEndedScreen({ summary, onBack }: EndedProps) {
  const { colors } = useAppTheme();
  const { height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, screenHeight), [colors, screenHeight]);
  const { t } = useAppTranslation('liveStreamViewer');
  const { formatFromFiat } = useFormattedPrice();

  return (
    <FlagshipScreen
      header={<FlagshipHeader title={t('ended.title')} onBack={onBack} />}
      scrollEnabled={false}
      contentStyle={styles.stateFlush}
    >
      <View style={styles.endedWrap}>
        <AppIcon name="check" variant="filled" size={IconSize.display} color="success" accessible={false} />
        <Text style={[styles.endedTitle, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('ended.title')}
        </Text>
        <Text style={[styles.endedSubtitle, { color: colors.textSecondary }]}>
          {t('ended.subtitle')}
        </Text>
        {summary ? (
          <View style={styles.endedStats}>
            <FlagshipMetricLine
              label={t('ended.viewers')}
              value={String(summary.totalViewers)}
              separated
            />
            <FlagshipMetricLine
              label={t('ended.lotsSold')}
              value={String(summary.lotsSold)}
              separated
            />
            <FlagshipMetricLine
              label={t('ended.totalSales')}
              value={formatFromFiat(summary.totalSales, 'GBP') ?? ''}
              separated
            />
          </View>
        ) : null}
        <AnimatedPressable
          onPress={onBack}
          style={[styles.endedDoneBtn, { backgroundColor: colors.brand }]}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={t('ended.done')}
        >
          <Text style={[styles.endedDoneText, { color: colors.textInverse }]}>{t('ended.done')}</Text>
        </AnimatedPressable>
      </View>
    </FlagshipScreen>
  );
}

const createStyles = (colors: ThemeColors, screenHeight: number) => StyleSheet.create({
  stateFlush: {
    paddingHorizontal: 0,
    paddingTop: 0,
    justifyContent: 'center' },
  connectSkeleton: {
    flex: 1,
    gap: Space.md },
  connectSkeletonChat: {
    paddingHorizontal: Space.md,
    gap: Space.sm },
  endedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md },
  endedTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  endedSubtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  endedStats: {
    width: '100%',
    marginTop: Space.sm },
  endedDoneBtn: {
    width: '100%',
    minHeight: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.sm },
  endedDoneText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily } });
