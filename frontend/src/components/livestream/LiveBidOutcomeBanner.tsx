/**
 * LiveBidOutcomeBanner — shown when a bid's outcome is unknown: the bid may
 * have committed, so the banner offers a real idempotent re-check instead
 * of fabricating a confirmation.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { useAppTranslation } from '../../i18n/useAppTranslation';

interface LiveBidOutcomeBannerProps {
  checkPending: boolean;
  onCheck: () => void;
  onDismiss: () => void;
}

export function LiveBidOutcomeBanner({ checkPending, onCheck, onDismiss }: LiveBidOutcomeBannerProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useAppTranslation('liveStreamViewer');

  return (
    <View
      style={[styles.unknownBanner, { backgroundColor: colors.surface, borderColor: colors.warningBorder, top: insets.top + Space.lg }]}
      pointerEvents="box-none"
    >
      <View style={styles.unknownBannerContent}>
        <AppIcon name="warning" size={IconSize.md} color="warning" accessible={false} />
        <View style={styles.unknownBannerText}>
          <Text style={[styles.unknownBannerTitle, { color: colors.textPrimary }]}>
            {t('unknown.title')}
          </Text>
          <Text style={[styles.unknownBannerSubtitle, { color: colors.textSecondary }]}>
            {t('unknown.subtitle')}
          </Text>
        </View>
      </View>
      <View style={styles.unknownBannerActions}>
        <AnimatedPressable
          onPress={onCheck}
          disabled={checkPending}
          style={[styles.unknownCheckBtn, { backgroundColor: colors.warning }]}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="Check bid status"
          accessibilityState={{ busy: checkPending }}
        >
          {checkPending ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={[styles.unknownCheckBtnText, { color: colors.textInverse }]}>
              {t('unknown.checkResult')}
            </Text>
          )}
        </AnimatedPressable>
        <AnimatedPressable
          onPress={onDismiss}
          style={styles.unknownDismissBtn}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Dismiss unknown bid status"
        >
          <Text style={[styles.unknownDismissBtnText, { color: colors.textSecondary }]}>
            {t('unknown.dismiss')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  unknownBanner: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.md,
    gap: Space.sm,
    zIndex: 20 },
  unknownBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm },
  unknownBannerText: {
    flex: 1,
    gap: Space.xs / 2 },
  unknownBannerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  unknownBannerSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  unknownBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: Space.xl },
  unknownCheckBtn: {
    minHeight: Control.hit,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  unknownCheckBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  unknownDismissBtn: {
    minHeight: Control.hit,
    paddingHorizontal: Space.md,
    justifyContent: 'center' },
  unknownDismissBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily } });
