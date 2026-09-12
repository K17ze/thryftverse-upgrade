/**
 * SessionCards — live shopping discovery surfaces.
 *
 * Flagship grammar: media is the object, text lives on the flat canvas below
 * it (no scrims, no gradients, no card chrome). Every element renders only
 * data the session contract actually carries — when the backend does not
 * provide a field (seller avatar/name on real sessions, watcher counts,
 * current bid), the element is omitted rather than fabricated.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { LiveBadge } from './LiveBadge';
import type { LiveSession } from '../../services/liveShoppingApi';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export const LIVE_CARD_WIDTH = 240;
const LIVE_CARD_MEDIA_HEIGHT = 220;
export const UPCOMING_THUMB_SIZE = 72;

function formatViewerCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
}

/** Small viewer-count meta shown only when the session reports viewers. */
export function ViewerMeta({ count, onMedia = false }: { count: number; onMedia?: boolean }) {
  const { colors } = useAppTheme();
  if (count <= 0) return null;
  const color = onMedia ? colors.scrimTextPrimary : colors.textMuted;
  return (
    <View
      style={[
        styles.viewerChip,
        onMedia && { backgroundColor: colors.overlay },
      ]}
      accessible={false}
    >
      <AppIcon name="eye" size={IconSize.xs} color={color} accessible={false} />
      <Text style={[styles.viewerChipText, { color }]}>{formatViewerCount(count)}</Text>
    </View>
  );
}

// ── Live session card (horizontal rail) ──────────────────────────────────────

export const LiveSessionCard = React.memo(function LiveSessionCard({
  session,
  formatBid,
  onPress,
}: {
  session: LiveSession;
  formatBid: (gbp: number) => string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('liveShopping');
  const bidLabel = session.currentBid != null ? formatBid(session.currentBid) : null;
  const hasMedia = !!session.thumbnail;

  return (
    <AnimatedPressable
      style={styles.liveCard}
      onPress={onPress}
      activeOpacity={0.9}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${session.title}${session.sellerName ? ` by ${session.sellerName}` : ''}. ${session.viewerCount} viewers${bidLabel ? `, current bid ${bidLabel}` : ''}. Tap to watch.`}
    >
      <View style={[styles.liveMedia, { backgroundColor: colors.surfaceAlt }]}>
        {hasMedia ? (
          <CachedImage
            uri={session.thumbnail}
            style={StyleSheet.absoluteFill}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <View style={styles.mediaFallback} accessible={false}>
            <AppIcon name="videocam" size={IconSize.hero} color="textMuted" />
          </View>
        )}
        <View style={styles.liveMediaTopRow}>
          <LiveBadge compact />
          <ViewerMeta count={session.viewerCount} onMedia />
        </View>
      </View>

      <View style={styles.cardBody}>
        {session.sellerName ? (
          <View style={styles.sellerRow}>
            {session.sellerAvatar ? (
              <CachedImage
                uri={session.sellerAvatar}
                style={styles.avatar}
                contentFit="cover"
                accessible={false}
              />
            ) : null}
            <Text style={[styles.sellerName, { color: colors.textSecondary }]} numberOfLines={1}>
              {session.sellerName}
            </Text>
            {session.sellerVerified ? (
              <AppIcon name="verified" size={IconSize.xs} color="commerceTrust" accessible={false} />
            ) : null}
          </View>
        ) : null}
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {session.title}
        </Text>
        {bidLabel ? (
          <View style={styles.bidRow}>
            <Text style={[styles.bidLabel, { color: colors.textMuted }]}>{t('card.currentBid')}</Text>
            <Text style={[styles.bidValue, { color: colors.textPrimary }]}>{bidLabel}</Text>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
});

// ── Upcoming session row (flat, hairline-separated) ──────────────────────────

export const UpcomingSessionRow = React.memo(function UpcomingSessionRow({
  session,
  formatScheduled,
}: {
  session: LiveSession;
  formatScheduled: (iso: string) => string;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('liveShopping');
  const scheduledLabel = session.scheduledAt ? formatScheduled(session.scheduledAt) : '';

  return (
    <View
      style={[styles.upcomingRow, { borderBottomColor: colors.border }]}
      accessibilityRole="text"
      accessibilityLabel={`${session.title}${session.sellerName ? ` by ${session.sellerName}` : ''}. ${scheduledLabel}.`}
    >
      <View style={[styles.upcomingThumb, { backgroundColor: colors.surfaceAlt }]}>
        {session.thumbnail ? (
          <CachedImage
            uri={session.thumbnail}
            style={StyleSheet.absoluteFill}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <AppIcon name="clock" size={IconSize.md} color="textMuted" style={styles.upcomingThumbIcon} />
        )}
      </View>
      <View style={styles.upcomingBody}>
        {scheduledLabel ? (
          <Text style={[styles.upcomingScheduled, { color: colors.brand }]}>{scheduledLabel}</Text>
        ) : null}
        {session.sellerName ? (
          <View style={styles.sellerRow}>
            <Text style={[styles.upcomingSeller, { color: colors.textSecondary }]} numberOfLines={1}>
              {session.sellerName}
            </Text>
            {session.sellerVerified ? (
              <AppIcon name="verified" size={IconSize.micro} color="commerceTrust" accessible={false} />
            ) : null}
          </View>
        ) : null}
        <Text style={[styles.upcomingTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {session.title}
        </Text>
        {session.watchers > 0 ? (
          <View style={styles.upcomingMetaRow}>
            <AppIcon name="people" size={IconSize.xs} color="textMuted" accessible={false} />
            <Text style={[styles.upcomingMeta, { color: colors.textMuted }]}>
              {session.watchers} {t('upcoming.waiting')}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

// ── Replay card (ended sessions) ─────────────────────────────────────────────

export const ReplaySessionCard = React.memo(function ReplaySessionCard({
  session,
  onPress,
}: {
  session: LiveSession;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('liveShopping');

  const durationLabel = (() => {
    if (!session.startedAt || !session.endedAt) return '';
    const diffMin = Math.round(
      (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
    );
    if (diffMin < 60) return `${diffMin}m`;
    return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
  })();

  const endedLabel = (() => {
    if (!session.endedAt) return '';
    const diffHr = Math.round((Date.now() - new Date(session.endedAt).getTime()) / 3_600_000);
    if (diffHr < 1) return t('replay.justEnded');
    if (diffHr < 24) return t('replay.hoursAgo', { count: diffHr });
    return t('replay.daysAgo', { count: Math.floor(diffHr / 24) });
  })();

  return (
    <AnimatedPressable
      style={styles.liveCard}
      onPress={onPress}
      activeOpacity={0.9}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Replay: ${session.title}${session.sellerName ? ` by ${session.sellerName}` : ''}. ${endedLabel}${durationLabel ? `, ${durationLabel}` : ''}.`}
    >
      <View style={[styles.replayMedia, { backgroundColor: colors.surfaceAlt }]}>
        {session.thumbnail ? (
          <CachedImage
            uri={session.thumbnail}
            style={StyleSheet.absoluteFill}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <View style={styles.mediaFallback} accessible={false}>
            <AppIcon name="play" size={IconSize.xl} color="textMuted" />
          </View>
        )}
        {session.thumbnail ? (
          <View style={styles.replayPlayIcon} accessible={false}>
            <AppIcon name="play" size={IconSize.md} color="scrimTextPrimary" />
          </View>
        ) : null}
        {durationLabel ? (
          <View style={[styles.replayDuration, { backgroundColor: colors.overlay }]}>
            <Text style={[styles.replayDurationText, { color: colors.scrimTextPrimary }]}>
              {durationLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        {session.sellerName ? (
          <View style={styles.sellerRow}>
            <Text style={[styles.sellerName, { color: colors.textSecondary }]} numberOfLines={1}>
              {session.sellerName}
            </Text>
            {session.sellerVerified ? (
              <AppIcon name="verified" size={IconSize.micro} color="commerceTrust" accessible={false} />
            ) : null}
          </View>
        ) : null}
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {session.title}
        </Text>
        {endedLabel ? (
          <Text style={[styles.replayEnded, { color: colors.textMuted }]}>{endedLabel}</Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  liveCard: {
    width: LIVE_CARD_WIDTH,
  },
  liveMedia: {
    width: '100%',
    height: LIVE_CARD_MEDIA_HEIGHT,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  liveMediaTopRow: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
  },
  viewerChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
  },
  cardBody: {
    paddingTop: Space.sm,
    gap: Space.xs / 2,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  avatar: {
    width: Space.lg,
    height: Space.lg,
    borderRadius: Radius.full,
  },
  sellerName: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  cardTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Space.xs / 2,
  },
  bidLabel: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
  },
  bidValue: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // ── Upcoming row ──
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  upcomingThumb: {
    width: UPCOMING_THUMB_SIZE,
    height: UPCOMING_THUMB_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingThumbIcon: {
    position: 'absolute',
  },
  upcomingBody: {
    flex: 1,
    gap: Space.xs / 2,
  },
  upcomingScheduled: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
  upcomingSeller: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  upcomingTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  upcomingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs / 2,
  },
  upcomingMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
  },
  // ── Replay card ──
  replayMedia: {
    width: '100%',
    height: 160,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  replayPlayIcon: {
    position: 'absolute',
    bottom: Space.sm,
    left: Space.sm,
  },
  replayDuration: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
  },
  replayDurationText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
  },
  replayEnded: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
});
