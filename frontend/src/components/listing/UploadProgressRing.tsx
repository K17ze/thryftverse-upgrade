import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, AccessibilityInfo, Text } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import Reanimated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  Easing } from 'react-native-reanimated';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import { Control, Radius } from '../../theme/designTokens';

export type ItemStatus = 'draft' | 'pending' | 'preparing' | 'uploading' | 'uploaded' | 'failed' | 'cancelled';

const RING_SIZE = 30;
const STROKE = 3;
const SCRIM_SIZE = 40;
const FADE_MS = 200;

const AnimatedCircle = Reanimated.createAnimatedComponent(SvgCircle);

/**
 * Circular determinate progress ring centred on the media. While
 * 'preparing' (no bytes yet) it shows an indeterminate spinner; on
 * completion the ring fades out — the visible photo IS the completion
 * state. On failure/cancellation it becomes a compact retry button.
 */
export function UploadProgressRing({
  status,
  progress,
  reducedMotion,
  onRetry,
  retryLabel,
  statusLabel = 'Uploading',
  isOffline = false,
  // NOTE: the four plain-string defaults below need localization — wire to
  // i18n `t()` once this file adopts the `t()` helper used in EditListingFooter.
  queuedLabel = 'Queued',
  waitingLabel = 'Waiting for connection',
  completeAnnouncement = 'Upload complete' }: {
  status: ItemStatus;
  /** Real transmitted-byte progress (0-1) from the upload queue. */
  progress: number;
  reducedMotion: boolean;
  onRetry: () => void;
  retryLabel: string;
  /** Screen-reader announcement for preparing/uploading states. */
  statusLabel?: string;
  /** When true, the upload queue is paused due to no connectivity. */
  isOffline?: boolean;
  /** Static label for the pending/queued state. Needs localization. */
  queuedLabel?: string;
  /** Label shown while paused offline. Needs localization. */
  waitingLabel?: string;
  /** Screen-reader announcement on completion. Needs localization. */
  completeAnnouncement?: string;
}) {
  const { colors } = useAppTheme();
  const [gone, setGone] = useState(false);
  const opacity = useSharedValue(1);
  const anim = useSharedValue(progress);
  const radius = RING_SIZE / 2 - STROKE / 2;
  const circumference = 2 * Math.PI * radius;

  // Determinate arc chases real byte progress as ticks arrive.
  useEffect(() => {
    anim.value = withTiming(progress, {
      duration: reducedMotion ? 0 : FADE_MS,
      easing: Easing.out(Easing.cubic) });
  }, [progress, reducedMotion, anim]);

  // Fade out on completion; reset if the item is re-queued.
  useEffect(() => {
    if (status === 'uploaded') {
      AccessibilityInfo.announceForAccessibility(completeAnnouncement);
      opacity.value = withTiming(0, { duration: reducedMotion ? 0 : FADE_MS });
      const timer = setTimeout(() => setGone(true), reducedMotion ? 0 : FADE_MS + 20);
      return () => clearTimeout(timer);
    }
    opacity.value = 1;
    setGone(false);
  }, [status, reducedMotion, opacity, completeAnnouncement]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - anim.value) }));

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (gone) return null;
  if (status !== 'pending' && status !== 'preparing' && status !== 'uploading' && status !== 'uploaded' && status !== 'failed' && status !== 'cancelled') return null;

  const retrying = status === 'failed' || status === 'cancelled';

  return (
    <Reanimated.View style={[styles.wrap, fade]} pointerEvents={retrying ? 'box-none' : 'none'}>
      {retrying ? (
        <Pressable
          style={styles.hit}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <View style={[styles.scrim, styles.scrimStrong]}>
            <AppIcon
              name={status === 'cancelled' ? 'close' : 'refresh'}
              size={20}
              color="textInverse"
              accessible={false} />
          </View>
        </Pressable>
      ) : (
        <View
          style={styles.hit}
          pointerEvents="none"
          accessible
          accessibilityRole={status === 'pending' ? 'none' : 'progressbar'}
          accessibilityLabel={status === 'preparing' ? 'Preparing' : status === 'pending' ? queuedLabel : statusLabel}
          accessibilityValue={status === 'pending' ? undefined : { min: 0, max: 100, now: Math.round(progress * 100) }}
        >
          <View style={styles.scrim}>
            {status === 'preparing' ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : status === 'pending' ? (
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <SvgCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth={STROKE}
                  fill="none" />
              </Svg>
            ) : (
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <SvgCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  stroke="rgba(0,0,0,0.25)"
                  strokeWidth={STROKE}
                  fill="none" />
                <AnimatedCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  stroke={colors.textInverse}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  animatedProps={arcProps}
                  transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`} />
              </Svg>
            )}
          </View>
        </View>
      )}
      {isOffline && (status === 'uploading' || status === 'pending') && (
        <Text
          style={[styles.waitingLabel, { color: colors.textInverse }]}
          accessibilityLiveRegion="polite"
        >
          {waitingLabel}
        </Text>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center' },
  hit: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  scrim: {
    width: SCRIM_SIZE,
    height: SCRIM_SIZE,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center' },
  scrimStrong: {
    backgroundColor: 'rgba(0,0,0,0.45)' },
  waitingLabel: {
    position: 'absolute',
    bottom: 2,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2 } });
