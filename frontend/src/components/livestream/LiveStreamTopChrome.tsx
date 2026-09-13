/**
 * LiveStreamTopChrome — restrained chrome over the video stage: leave +
 * seller identity (left), live badge + viewer count + share (right).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { LiveBadge } from '../live/LiveBadge';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { formatViewerCount } from './livestreamUtils';
import type { SellerIdentity } from '../../hooks/livestream/types';

interface LiveStreamTopChromeProps {
  sellerIdentity: SellerIdentity | null;
  /** True when the stream contract carries a sellerId to follow. */
  canFollow: boolean;
  isFollowing: boolean;
  followPending: boolean;
  viewerCount: number;
  onLeave: () => void;
  onFollowToggle: () => void;
  onShare: () => void;
}

export function LiveStreamTopChrome({
  sellerIdentity,
  canFollow,
  isFollowing,
  followPending,
  viewerCount,
  onLeave,
  onFollowToggle,
  onShare,
}: LiveStreamTopChromeProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useAppTranslation('liveStreamViewer');

  return (
    <View style={[styles.topOverlay, { paddingTop: insets.top + Space.xs }]}>
      <View style={styles.topLeftCluster}>
        <AnimatedPressable
          onPress={onLeave}
          style={styles.iconHit}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Leave stream"
        >
          <AppIcon name="back" size={IconSize.lg} color="scrimTextPrimary" accessible={false} />
        </AnimatedPressable>
        {sellerIdentity ? (
          <View style={styles.sellerIdentity}>
            {sellerIdentity.avatar ? (
              <CachedImage
                uri={sellerIdentity.avatar}
                style={styles.sellerAvatar}
                contentFit="cover"
                accessible={false}
              />
            ) : null}
            <View style={styles.sellerNameRow}>
              <Text style={[styles.sellerName, { color: colors.scrimTextPrimary }]} numberOfLines={1}>
                {sellerIdentity.name}
              </Text>
              {sellerIdentity.verified ? (
                <AppIcon name="verified" size={IconSize.micro} color="scrimTextPrimary" accessible={false} />
              ) : null}
            </View>
            {canFollow ? (
              <AnimatedPressable
                onPress={onFollowToggle}
                disabled={followPending}
                style={styles.followHit}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={isFollowing ? 'Unfollow seller' : 'Follow seller'}
                accessibilityState={{ busy: followPending }}
              >
                {followPending ? (
                  <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
                ) : (
                  <Text style={[styles.followText, { color: colors.scrimTextPrimary }]}>
                    {isFollowing ? t('seller.following') : t('seller.follow')}
                  </Text>
                )}
              </AnimatedPressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.topRightCluster}>
        <LiveBadge compact label={t('live.label')} />
        {viewerCount > 0 ? (
          <View style={styles.viewerMeta} accessible={false}>
            <AppIcon name="eye" size={IconSize.xs} color="scrimTextPrimary" accessible={false} />
            <Text style={[styles.viewerText, { color: colors.scrimTextPrimary }]}>
              {formatViewerCount(viewerCount)}
            </Text>
          </View>
        ) : null}
        <AnimatedPressable
          onPress={onShare}
          style={styles.iconHit}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Share stream"
        >
          <AppIcon name="share" size={IconSize.md} color="scrimTextPrimary" accessible={false} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    zIndex: 10 },
  topLeftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1 },
  iconHit: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  sellerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1 },
  sellerAvatar: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.full },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    flexShrink: 1 },
  sellerName: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    flexShrink: 1 },
  followHit: {
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.xs },
  followText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  topRightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  viewerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  viewerText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] } });
