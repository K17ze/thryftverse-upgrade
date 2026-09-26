import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useUploadManager } from '../core/upload/useUploadManager';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useToast } from '../../context/ToastContext';

// ── Global Upload Indicator ────────────────────────────────────────
// Ambient progress surface for creator uploads — the Instagram pattern
// of a thin determinate bar pinned to the top edge. Mounted at the app
// root so it is visible on every screen, including after the publish
// sheet is dismissed mid-upload.
//
// Honesty contract: the fill tracks real transmitted bytes from the
// UploadManager — never interpolated. Offline parks the bar in a dimmed
// state rather than pretending to progress; the confirmation phase
// holds the bar full until the server acknowledges.
//
// Because this is the only always-mounted upload observer, it also owns
// the failure notification: a job reaching 'failed' outside the publish
// sheet surfaces a toast so a backgrounded upload never dies silently.

const BAR_HEIGHT = 3;

export function GlobalUploadIndicator() {
  const { jobs, isUploading, isConfirming, isOffline, progress } = useUploadManager();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const { show: showToast } = useToast();

  const width = useSharedValue(0);
  const opacity = useSharedValue(0);
  const seenFailuresRef = useRef<Set<string>>(new Set());

  const active = isUploading || isConfirming;

  useEffect(() => {
    opacity.value = reduceMotion
      ? (active ? 1 : 0)
      : withTiming(active ? 1 : 0, { duration: 200 });
  }, [active, reduceMotion, opacity]);

  useEffect(() => {
    width.value = reduceMotion ? progress : withTiming(progress, { duration: 150 });
  }, [progress, reduceMotion, width]);

  // Surface failures that happen while the publish sheet is dismissed.
  // A batch of simultaneous failures (e.g. connectivity drop across N
  // jobs) produces a single toast — the message is about the upload, not
  // the individual job.
  useEffect(() => {
    let newFailure = false;
    for (const job of jobs) {
      if (job.status === 'failed' && !seenFailuresRef.current.has(job.id)) {
        seenFailuresRef.current.add(job.id);
        newFailure = true;
      }
    }
    if (newFailure) {
      showToast("Upload didn't finish. Reopen your draft to retry.", 'error');
    }
  }, [jobs, showToast]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: opacity.value }));

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.round(width.value * 1000) / 10}%` }));

  // The opacity gate lives on the OUTER track, not the fill: the track
  // paints a full-width `surfaceAlt` band, so gating only the fill left a
  // permanent 3px hairline under the status bar on every screen.
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.track, { top: insets.top, backgroundColor: colors.surfaceAlt }, barStyle]}
      accessibilityRole="progressbar"
      accessibilityLabel={isOffline ? 'Upload waiting for connection' : 'Upload progress'}
      accessibilityHint="Upload continues in the background"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'yes' : 'no-hide-descendants'}
    >
      <View style={styles.barClip}>
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: isOffline ? colors.scrimTextTertiary : colors.brand },
            fillStyle,
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    zIndex: 200 },
  barClip: {
    flex: 1 },
  fill: {
    height: '100%' } });
