/**
 * LiveStreamReplayScreen — VOD replay for an ended live session (R101).
 *
 * Composition mirrors the live viewer's grammar: the recording is the
 * dominant object (16:9 stage on the dark media canvas), chrome is
 * restrained, and session metadata lives on the flat canvas below —
 * hairlines and type hierarchy, no cards.
 *
 * Truthful UI (AGENTS §11): the stage only renders a player when the
 * backend reports a real `recordingUrl`. An ended session whose egress is
 * still processing shows the processing state with a re-check; a session
 * that was never recorded says so; a playback failure shows an honest
 * error with retry — never a dead player.
 *
 * "More replays" consumes the same ended-session list the home rail uses
 * (`GET /streaming/sessions`, ended rows) and pushes another replay onto
 * the stack, keeping the deep-linkable /sessions/:id contract intact.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { EditorCanvas, Space, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  SkeletonBlock,
  SkeletonTextLine } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppIcon } from '../components/common/AppIcon';
import { CachedImage } from '../components/CachedImage';
import { HorizontalRail } from '../components/HorizontalRail';
import { IconSize } from '../theme/iconTokens';
import { ReplaySessionCard } from '../components/live/SessionCards';
import { useConnectivity } from '../hooks/useConnectivity';
import { useAppTranslation } from '../i18n/useAppTranslation';
import { track } from '../analytics';
import {
  fetchSessionReplay,
  fetchPastStreams,
  type LiveSession,
  type LiveSessionReplay } from '../services/liveShoppingApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type LiveStreamReplayRoute = RouteProp<RootStackParamList, 'LiveStreamReplay'>;

type LoadPhase = 'loading' | 'ready' | 'error';

// ── Replay stage — single dedicated player (not the feed pool) ─────────────
// The feed's VideoManager pool exists for viewport-scored short-form
// autoplay; a replay is a deliberate, user-initiated long-form watch, so it
// gets its own useVideoPlayer with native seek controls — the same path
// FullscreenMediaViewer uses for single-video playback.

const ReplayPlayer = React.memo(function ReplayPlayer({
  uri,
  posterUri,
  onPlaybackError,
}: {
  uri: string;
  posterUri: string | null;
  onPlaybackError: () => void;
}) {
  const { width } = useWindowDimensions();
  const stageHeight = Math.round((width * 9) / 16);
  const [ready, setReady] = useState(false);

  const source = useMemo(
    // The native player handles HLS rendition ladders itself; declaring the
    // content type keeps .m3u8 recordings on the ABR path (same rule as
    // VideoManager.selectRendition).
    () =>
      uri.endsWith('.m3u8')
        ? { uri, contentType: 'hls' as const }
        : { uri },
    [uri],
  );

  const player = useVideoPlayer(source, (instance) => {
    try {
      instance.muted = false;
      instance.loop = false;
    } catch {
      /* no-op — player may reject setup before attach */
    }
  });

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.(
      'statusChange',
      (event: { status?: string; error?: unknown }) => {
        if (event?.status === 'error') {
          onPlaybackError();
        } else if (event?.status === 'readyToPlay') {
          setReady(true);
        }
      },
    );
    return () => sub?.remove?.();
  }, [player, onPlaybackError]);

  return (
    <View style={[stageStyles.stage, { height: stageHeight }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
      />
      {/* Session thumbnail as the pre-play poster — real contract imagery,
          not a fabricated recording cover. */}
      {!ready && posterUri ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <ExpoImage
            source={{ uri: posterUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={posterUri}
          />
        </View>
      ) : null}
      {!ready ? (
        <View pointerEvents="none" style={stageStyles.loadingCenter}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
});

const stageStyles = StyleSheet.create({
  stage: {
    width: '100%',
    backgroundColor: EditorCanvas,
    overflow: 'hidden' },
  loadingCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center' } });

// ── Loading skeleton — matches the final layout geometry ───────────────────

function ReplaySkeleton({ stageHeight }: { stageHeight: number }) {
  return (
    <View>
      <SkeletonBlock width="100%" height={stageHeight} radius={Radius.none} />
      <View style={{ padding: Space.md, gap: Space.sm }}>
        <SkeletonTextLine width="72%" height={18} />
        <SkeletonTextLine width="40%" height={12} />
      </View>
    </View>
  );
}

// ── Main screen ──

export function LiveStreamReplayScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<LiveStreamReplayRoute>();
  const { colors } = useAppTheme();
  const styles = useStyles(colors);
  const { isOffline } = useConnectivity();
  const { t } = useAppTranslation('liveReplay');
  const { width } = useWindowDimensions();
  const stageHeight = Math.round((width * 9) / 16);

  const sessionId = route.params?.sessionId;

  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [replay, setReplay] = useState<LiveSessionReplay | null>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [moreReplays, setMoreReplays] = useState<LiveSession[] | null>(null);

  // S20-07: monotonic epoch guards the primary fetch — every load (initial,
  // session change, retry, refetch) increments it and captures its value;
  // only the newest request may write state. The effect cleanup bumps it so
  // a late response can't fire on an unmounted or superseded screen.
  const loadEpochRef = useRef(0);

  const load = useCallback(async () => {
    const epoch = ++loadEpochRef.current;
    setPhase('loading');
    setPlaybackFailed(false);
    if (!sessionId) {
      // Missing route param — render the not-found state, not a load error.
      setReplay(null);
      setPhase('ready');
      return;
    }
    try {
      const result = await fetchSessionReplay(sessionId);
      if (epoch !== loadEpochRef.current) return;
      setReplay(result);
      setPhase('ready');
      if (result?.recordingUrl) {
        track('live_stream_viewed', { stream_id: sessionId });
      }
    } catch {
      if (epoch !== loadEpochRef.current) return;
      setReplay(null);
      setPhase('error');
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
    return () => {
      loadEpochRef.current += 1;
    };
  }, [load]);

  // Secondary surface — other ended sessions for continuous watching. A
  // failure here omits the rail instead of erroring the whole screen; the
  // replay itself is the primary content.
  useEffect(() => {
    if (phase !== 'ready' || !replay?.recordingUrl) return;
    let cancelled = false;
    fetchPastStreams({ limit: 20 })
      .then((sessions) => {
        if (cancelled) return;
        setMoreReplays(sessions.filter((s) => s.id !== sessionId));
      })
      .catch(() => {
        if (!cancelled) setMoreReplays(null);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, replay?.recordingUrl, sessionId]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const handlePlaybackError = useCallback(() => {
    setPlaybackFailed(true);
  }, []);

  // A playback failure on a signed recording URL usually means the URL
  // expired — remounting replays the same dead URL forever. Retry refetches
  // the replay payload through the same API path for a fresh URL (or an
  // honest processing/not-found state when the recording is gone).
  const handleRetryPlayback = useCallback(async () => {
    if (!sessionId) return;
    const epoch = ++loadEpochRef.current;
    try {
      const fresh = await fetchSessionReplay(sessionId);
      if (epoch !== loadEpochRef.current) return;
      // Apply the fresh payload unconditionally — a null (session gone) or
      // recordingUrl-less (still processing) response must replace the stale
      // replay so the screen renders the honest state instead of remounting
      // the expired URL forever.
      setReplay(fresh);
      setPlaybackFailed(false);
      // Remount the player stage — a retry is a fresh watch attempt against
      // the (possibly refreshed) URL, not a resume of the failed source.
      setPlaybackAttempt((n) => n + 1);
    } catch {
      if (epoch !== loadEpochRef.current) return;
      // Refetch failed — keep the honest playback-error state and retry.
    }
  }, [sessionId]);

  const openReplay = useCallback(
    (id: string) => {
      navigation.push('LiveStreamReplay', { sessionId: id });
    },
    [navigation],
  );

  const openLiveViewer = useCallback(() => {
    navigation.replace('LiveStreamViewer', { sessionId });
  }, [navigation, sessionId]);

  const endedLabel = useMemo(() => {
    if (!replay?.endedAt) return '';
    const diffHr = Math.round((Date.now() - new Date(replay.endedAt).getTime()) / 3_600_000);
    if (diffHr < 1) return t('meta.justEnded');
    if (diffHr < 24) return t('meta.hoursAgo', { count: diffHr });
    return t('meta.daysAgo', { count: Math.floor(diffHr / 24) });
  }, [replay?.endedAt, t]);

  const durationLabel = useMemo(() => {
    if (!replay?.startedAt || !replay?.endedAt) return '';
    const diffMin = Math.round(
      (new Date(replay.endedAt).getTime() - new Date(replay.startedAt).getTime()) / 60_000,
    );
    if (diffMin <= 0) return '';
    if (diffMin < 60) return `${diffMin}m`;
    return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
  }, [replay?.startedAt, replay?.endedAt]);

  const headerTitle = replay?.title || t('header.title');

  return (
    <FlagshipScreen
      testID="live-replay-screen"
      header={
        <FlagshipHeader
          title={headerTitle}
          onBack={goBack}
        />
      }
      contentStyle={styles.contentFlush}
    >
      {/* ── Loading ── */}
      {phase === 'loading' ? <ReplaySkeleton stageHeight={stageHeight} /> : null}

      {/* ── Load error ── */}
      {phase === 'error' ? (
        <FlagshipState
          variant={isOffline ? 'offline' : 'error'}
          title={t('error.title')}
          subtitle={t('error.subtitle')}
          actionLabel={t('error.retry')}
          onAction={() => void load()}
          secondaryActionLabel={t('error.goBack')}
          onSecondaryAction={goBack}
        />
      ) : null}

      {phase === 'ready' && !replay ? (
        <FlagshipState
          variant="unavailable"
          icon="videocam-off-outline"
          title={t('notFound.title')}
          subtitle={t('notFound.subtitle')}
          secondaryActionLabel={t('error.goBack')}
          onSecondaryAction={goBack}
        />
      ) : null}

      {phase === 'ready' && replay && replay.status !== 'ended' ? (
        <FlagshipState
          variant="unavailable"
          icon="radio-outline"
          title={replay.status === 'live' ? t('stillLive.title') : t('notEnded.title')}
          subtitle={replay.status === 'live' ? t('stillLive.subtitle') : t('notEnded.subtitle')}
          actionLabel={replay.status === 'live' ? t('stillLive.watchLive') : undefined}
          onAction={replay.status === 'live' ? openLiveViewer : undefined}
          secondaryActionLabel={t('error.goBack')}
          onSecondaryAction={goBack}
        />
      ) : null}

      {phase === 'ready' && replay && replay.status === 'ended' && !replay.recordingEnabled ? (
        <FlagshipState
          variant="unavailable"
          icon="videocam-off-outline"
          title={t('noRecording.title')}
          subtitle={t('noRecording.subtitle')}
          secondaryActionLabel={t('error.goBack')}
          onSecondaryAction={goBack}
        />
      ) : null}

      {phase === 'ready' &&
      replay &&
      replay.status === 'ended' &&
      replay.recordingEnabled &&
      !replay.recordingUrl ? (
        <FlagshipState
          variant="unavailable"
          icon="time-outline"
          title={t('processing.title')}
          subtitle={t('processing.subtitle')}
          actionLabel={t('processing.checkAgain')}
          onAction={() => void load()}
          secondaryActionLabel={t('error.goBack')}
          onSecondaryAction={goBack}
        />
      ) : null}

      {/* ── Replay ── */}
      {phase === 'ready' && replay && replay.status === 'ended' && replay.recordingUrl ? (
        <View>
          {playbackFailed ? (
            <View style={[styles.stageError, { height: stageHeight }]}>
              <AppIcon name="alert" size={IconSize.xl} color="scrimTextTertiary" accessible={false} />
              <Text style={styles.stageErrorText}>{t('playbackError.title')}</Text>
              <Text style={styles.stageErrorSub}>{t('playbackError.subtitle')}</Text>
              <AnimatedPressable
                style={styles.stageRetryBtn}
                onPress={handleRetryPlayback}
                hapticFeedback="light"
                scaleValue={0.97}
                accessibilityRole="button"
                accessibilityLabel={t('playbackError.retry')}
              >
                <Text style={styles.stageRetryText}>{t('playbackError.retry')}</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <ReplayPlayer
              key={`${replay.sessionId}:${playbackAttempt}`}
              uri={replay.recordingUrl}
              posterUri={replay.thumbnailUrl}
              onPlaybackError={handlePlaybackError}
            />
          )}

          {/* Session metadata — flat canvas, hairline-separated */}
          <View style={styles.meta}>
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
              {replay.title}
            </Text>
            {replay.hostUsername ? (
              <View style={styles.hostRow}>
                {replay.hostAvatarUrl ? (
                  <CachedImage
                    uri={replay.hostAvatarUrl}
                    style={styles.hostAvatar}
                    contentFit="cover"
                    accessible={false}
                  />
                ) : null}
                <Text style={[styles.hostName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {replay.hostUsername}
                </Text>
                {replay.hostVerified ? (
                  <AppIcon name="verified" size={IconSize.xs} color="commerceTrust" accessible={false} />
                ) : null}
              </View>
            ) : null}
            {endedLabel || durationLabel ? (
              <Text style={[styles.metaLine, { color: colors.textMuted }]}>
                {[endedLabel, durationLabel].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>

          {/* More replays — omitted entirely when empty or failed */}
          {moreReplays && moreReplays.length > 0 ? (
            <View>
              <View style={[styles.moreHeader, { borderTopColor: colors.border }]}>
                <Text style={[styles.moreTitle, { color: colors.textPrimary }]} accessibilityRole="header">
                  {t('moreReplays.title')}
                </Text>
              </View>
              <HorizontalRail
                contentContainerStyle={styles.moreRail}
                decelerationRate="fast"
                accessibilityLabel={t('moreReplays.a11y')}
              >
                {moreReplays.map((session) => (
                  <ReplaySessionCard
                    key={session.id}
                    session={session}
                    onPress={() => openReplay(session.id)}
                  />
                ))}
              </HorizontalRail>
            </View>
          ) : null}
        </View>
      ) : null}
    </FlagshipScreen>
  );
}

// ── Theme-aware styles factory ──
function useStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        contentFlush: {
          paddingHorizontal: 0,
          paddingTop: 0,
          paddingBottom: Space.xxl },
        stageError: {
          width: '100%',
          backgroundColor: EditorCanvas,
          alignItems: 'center',
          justifyContent: 'center',
          gap: Space.sm },
        stageErrorText: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.scrimTextSecondary },
        stageErrorSub: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.scrimTextTertiary },
        stageRetryBtn: {
          marginTop: Space.sm,
          minHeight: Control.hit,
          paddingHorizontal: Space.lg,
          justifyContent: 'center',
          alignItems: 'center' },
        stageRetryText: {
          fontSize: TypographyV2.body.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.scrimTextPrimary },
        meta: {
          paddingHorizontal: Space.md,
          paddingVertical: Space.md,
          gap: Space.xs },
        title: {
          fontSize: TypographyV2.sectionTitle.size,
          fontFamily: TypographyV2.sectionTitle.fontFamily,
          letterSpacing: TypographyV2.sectionTitle.letterSpacing,
          lineHeight: TypographyV2.sectionTitle.lineHeight },
        hostRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs },
        hostAvatar: {
          width: Space.lg,
          height: Space.lg,
          borderRadius: Radius.full },
        hostName: {
          fontSize: TypographyV2.body.size,
          fontFamily: TypographyV2.body.fontFamily,
          flexShrink: 1 },
        metaLine: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          fontVariant: ['tabular-nums'] },
        moreHeader: {
          borderTopWidth: Stroke.hairline,
          paddingHorizontal: Space.md,
          paddingTop: Space.md,
          paddingBottom: Space.sm },
        moreTitle: {
          fontSize: TypographyV2.sectionTitle.size,
          fontFamily: TypographyV2.sectionTitle.fontFamily,
          letterSpacing: TypographyV2.sectionTitle.letterSpacing },
        moreRail: {
          paddingHorizontal: Space.md,
          gap: Space.md } }),
    [colors],
  );
}
