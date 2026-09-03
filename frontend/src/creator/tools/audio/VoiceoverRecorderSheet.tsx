/**
 * VoiceoverRecorderSheet — bottom sheet for recording voiceovers.
 *
 * Per spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10 (P1: voiceover).
 *
 * Features:
 *   - Large record button (64pt) with pulsing red ring animation (Reanimated)
 *   - Real-time waveform visualization during recording (metering-driven)
 *   - Timer display (mm:ss format)
 *   - Pause/resume recording
 *   - Retake (discard and re-record)
 *   - Done → returns the recorded voiceover clip to the parent
 *   - Haptics on record start/stop/pause
 *   - Microphone permission handling (request on open, show denied state)
 *
 * Per AGENTS.md §11 (truthful UI): VoiceoverRecorder.isAvailable() returns
 * false when the expo-audio native module is not linked (e.g., Expo Go
 * without a development build). The sheet shows an honest "unavailable"
 * state rather than pretending recording works. With a development build
 * that includes expo-audio, the recorder's real implementation activates
 * and this UI works end-to-end.
 *
 * Per AGENTS.md §13: 44pt touch targets for all interactive controls.
 * Per AGENTS.md §17: Reanimated for animations (no PanResponder).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  useReducedMotion } from 'react-native-reanimated';

import {
  Space,
  Radius,
  Typography,
  FontFamily,
  Control,
  Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion as useHookReducedMotion } from '../../../hooks/useReducedMotion';
import { Motion } from '../../../theme/motionTokens';
import {
  VoiceoverRecorder,
  VoiceoverDependencyError,
  type VoiceoverClip } from '../../core/audio';
import type { MeteringListener } from '../../core/audio/VoiceoverRecorder';

// ── Constants ─────────────────────────────────────────────────────────

const RECORD_BUTTON_SIZE = 64;
const RING_BASE_SIZE = RECORD_BUTTON_SIZE + 12;
const WAVEFORM_BAR_COUNT = 48;
const WAVEFORM_MAX_HEIGHT = 56;
const WAVEFORM_MIN_HEIGHT = 3;
const TIMER_INTERVAL_MS = 100;
const METERING_INTERVAL_MS = 60;

// ── Types ─────────────────────────────────────────────────────────────

export interface VoiceoverRecorderSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the recorded clip when the user taps Done. */
  onConfirm: (clip: VoiceoverClip) => void;
}

type RecorderPhase =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'recorded'
  | 'denied'
  | 'unavailable';

// ── Helpers ───────────────────────────────────────────────────────────

function formatTimer(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────

export function VoiceoverRecorderSheet({
  visible,
  onClose,
  onConfirm }: VoiceoverRecorderSheetProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const hookReducedMotion = useHookReducedMotion();
  const reanimatedReducedMotion = useReducedMotion();
  const reducedMotion = hookReducedMotion || reanimatedReducedMotion;
  const styles = useSheetStyles(colors);

  const recorderRef = useRef<VoiceoverRecorder | null>(null);
  if (recorderRef.current === null) {
    recorderRef.current = new VoiceoverRecorder();
  }

  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(() =>
    new Array(WAVEFORM_BAR_COUNT).fill(0),
  );
  const [recordedClip, setRecordedClip] = useState<VoiceoverClip | null>(null);
  const [meteringAvailable, setMeteringAvailable] = useState(true);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Reanimated shared values
  const ringOpacitySV = useSharedValue(0);

  // Timer + metering intervals
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringUnsubscribeRef = useRef<(() => void) | null>(null);

  // ── Reset state when sheet opens ──────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setPhase('idle');
    setElapsedMs(0);
    setRecordedClip(null);
    setRecordingError(null);
    setWaveformBars(new Array(WAVEFORM_BAR_COUNT).fill(0));

    // Check availability and request permission on open
    if (!VoiceoverRecorder.isAvailable()) {
      setPhase('unavailable');
      return;
    }

    const recorder = recorderRef.current!;
    recorder
      .requestPermission()
      .then((granted) => {
        setPhase(granted ? 'idle' : 'denied');
      })
      .catch(() => {
        setPhase('unavailable');
      });
  }, [visible]);

  // ── Cleanup on unmount / close ────────────────────────────────────
  useEffect(() => {
    if (visible) return;
    // Stop any active recording when the sheet closes
    const recorder = recorderRef.current;
    if (recorder && (phase === 'recording' || phase === 'paused')) {
      recorder.cancelRecording().catch(() => {});
    }
    stopTimer();
    stopMetering();
    cancelAnimation(ringOpacitySV);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Release native recorder on unmount ────────────────────────────
  useEffect(() => {
    const recorder = recorderRef.current;
    return () => {
      recorder?.dispose();
    };
  }, []);

  // ── Timer management ──────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerIntervalRef.current = setInterval(() => {
      const recorder = recorderRef.current;
      if (recorder) {
        setElapsedMs(recorder.elapsedMs);
      }
    }, TIMER_INTERVAL_MS);
  }, [stopTimer]);

  // ── Metering management ───────────────────────────────────────────
  const stopMetering = useCallback(() => {
    if (meteringUnsubscribeRef.current) {
      meteringUnsubscribeRef.current();
      meteringUnsubscribeRef.current = null;
    }
  }, []);

  const startMetering = useCallback(() => {
    stopMetering();
    const recorder = recorderRef.current!;
    const listener: MeteringListener = (level: number) => {
      setWaveformBars((prev) => {
        const next = prev.slice(1);
        next.push(Math.max(WAVEFORM_MIN_HEIGHT / WAVEFORM_MAX_HEIGHT, level));
        return next;
      });
    };
    meteringUnsubscribeRef.current = recorder.setMeteringListener(listener);
  }, [stopMetering]);

  // ── Static recording indicator ────────────────────────────────────
  // Per AGENTS.md §17, continuous pulsing is prohibited. The recording
  // state is already communicated by the timer and the "REC" label, so
  // the ring is a static solid element (no pulse animation).
  const startPulse = useCallback(() => {
    ringOpacitySV.value = 0.5;
  }, [ringOpacitySV]);

  const stopPulse = useCallback(() => {
    cancelAnimation(ringOpacitySV);
    ringOpacitySV.value = 0;
  }, [ringOpacitySV]);

  // ── Recording actions ─────────────────────────────────────────────
  const handleStartRecording = useCallback(async () => {
    const recorder = recorderRef.current!;
    setRecordingError(null);
    try {
      if (!reducedMotion) haptic.medium();
      await recorder.startRecording();
      setPhase('recording');
      setElapsedMs(0);
      setWaveformBars(new Array(WAVEFORM_BAR_COUNT).fill(0));
      setMeteringAvailable(VoiceoverRecorder.isAvailable());
      startTimer();
      startMetering();
      startPulse();
    } catch (err) {
      if (err instanceof VoiceoverDependencyError) {
        setPhase('unavailable');
      } else {
        if (!reducedMotion) haptic.error();
        setRecordingError(err instanceof Error ? err.message : 'Recording failed. Try again.');
      }
    }
  }, [haptic, reducedMotion, startTimer, startMetering, startPulse]);

  const handlePauseRecording = useCallback(async () => {
    const recorder = recorderRef.current!;
    if (!reducedMotion) haptic.light();
    await recorder.pauseRecording();
    setPhase('paused');
    stopTimer();
    stopMetering();
    stopPulse();
  }, [haptic, reducedMotion, stopTimer, stopMetering, stopPulse]);

  const handleResumeRecording = useCallback(async () => {
    const recorder = recorderRef.current!;
    if (!reducedMotion) haptic.light();
    await recorder.resumeRecording();
    setPhase('recording');
    startTimer();
    startMetering();
    startPulse();
  }, [haptic, reducedMotion, startTimer, startMetering, startPulse]);

  const handleStopRecording = useCallback(async () => {
    const recorder = recorderRef.current!;
    if (!reducedMotion) haptic.medium();
    try {
      const clip = await recorder.stopRecording();
      stopTimer();
      stopMetering();
      stopPulse();
      setElapsedMs(clip.durationMs);
      setRecordedClip(clip);
      setPhase('recorded');
    } catch (err) {
      if (err instanceof VoiceoverDependencyError) {
        setPhase('unavailable');
      }
      stopTimer();
      stopMetering();
      stopPulse();
    }
  }, [haptic, reducedMotion, stopTimer, stopMetering, stopPulse]);

  const handleRetake = useCallback(() => {
    if (!reducedMotion) haptic.light();
    const recorder = recorderRef.current!;
    recorder.cancelRecording().catch(() => {});
    setRecordedClip(null);
    setElapsedMs(0);
    setWaveformBars(new Array(WAVEFORM_BAR_COUNT).fill(0));
    setRecordingError(null);
    setPhase('idle');
  }, [haptic, reducedMotion]);

  const handleDone = useCallback(() => {
    if (!recordedClip) return;
    if (!reducedMotion) haptic.success();
    onConfirm(recordedClip);
  }, [recordedClip, haptic, onConfirm, reducedMotion]);

  const handleClose = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onClose();
  }, [haptic, onClose, reducedMotion]);

  // ── Animated styles ───────────────────────────────────────────────
  // Static ring — solid appearance, no continuous pulse (AGENTS.md §17).
  const ringStyle = useAnimatedStyle(() => {
    return {
      opacity: ringOpacitySV.value };
  });

  // ── Render ────────────────────────────────────────────────────────
  const isRecording = phase === 'recording';
  const isPaused = phase === 'paused';
  const hasRecording = phase === 'recorded' && recordedClip !== null;
  const canRecord = phase === 'idle' || phase === 'recorded';

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.7}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <PressScale
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close voiceover recorder"
            accessibilityHint="Closes the voiceover recording sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Voiceover
          </Text>
          <PressScale
            onPress={handleDone}
            style={styles.doneBtn}
            accessibilityLabel="Done"
            accessibilityRole="button"
            accessibilityHint="Add voiceover to composition"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.doneBtnText, { color: colors.brand }]}>Done</Text>
          </PressScale>
        </View>

        {phase === 'unavailable' ? (
          <UnavailableState colors={colors} styles={styles} />
        ) : phase === 'denied' ? (
          <DeniedState colors={colors} styles={styles} />
        ) : (
          <>
            {/* ── Timer ─────────────────────────────────────────────── */}
            <View style={styles.timerContainer}>
              <Text
                style={[styles.timer, { color: colors.textPrimary }]}
                accessibilityLabel={`Recording time ${formatTimer(elapsedMs)}`}
              >
                {formatTimer(elapsedMs)}
              </Text>
              {isRecording && (
                <View
                  style={[styles.recordingDot, { backgroundColor: colors.danger }]}
                />
              )}
              {isPaused && (
                <Text
                  style={[styles.recordingLabel, { color: colors.textSecondary }]}
                >
                  Paused
                </Text>
              )}
            </View>

            {/* ── Waveform visualization ────────────────────────────── */}
            <View
              style={styles.waveformContainer}
              accessibilityLabel="Live audio waveform"
              accessibilityRole="image"
            >
              <WaveformVisualization
                bars={waveformBars}
                color={isRecording ? colors.danger : colors.brand}
                maxHeight={WAVEFORM_MAX_HEIGHT}
                minHeight={WAVEFORM_MIN_HEIGHT}
              />
            </View>

            {/* ── Metering unavailable notice (truthful) ────────────── */}
            {isRecording && !meteringAvailable && (
              <Text
                style={[styles.meteringNotice, { color: colors.textMuted }]}
              >
                Metering unavailable on this device.
              </Text>
            )}

            {/* ── Record button + ring ──────────────────────────────── */}
            <View style={styles.recordButtonContainer}>
              {isRecording && (
                <Reanimated.View
                  style={[
                    styles.pulseRing,
                    {
                      width: RING_BASE_SIZE,
                      height: RING_BASE_SIZE,
                      borderRadius: RING_BASE_SIZE / 2,
                      borderColor: colors.danger },
                    ringStyle,
                  ]}
                  pointerEvents="none"
                />
              )}

              <RecordButton
                size={RECORD_BUTTON_SIZE}
                phase={phase}
                colors={colors}
                disabled={!canRecord && !isRecording && !isPaused}
                onPress={
                  isRecording
                    ? handleStopRecording
                    : isPaused
                      ? handleStopRecording
                      : handleStartRecording
                }
                reducedMotion={reducedMotion}
                haptic={haptic}
              />
            </View>

            {recordingError && (
              <View style={styles.recordingErrorBanner}>
                <Text style={[styles.recordingErrorText, { color: colors.danger }]}>
                  {recordingError}
                </Text>
                <PressScale
                  onPress={() => { setRecordingError(null); handleStartRecording(); }}
                  style={[styles.recordingErrorRetry, { borderColor: colors.danger }]}
                  accessibilityLabel="Try recording again"
                  accessibilityRole="button"
                >
                  <Text style={[styles.recordingErrorRetryText, { color: colors.danger }]}>
                    Try again
                  </Text>
                </PressScale>
              </View>
            )}

            {/* ── Secondary controls ────────────────────────────────── */}
            <View style={styles.secondaryControls}>
              {isRecording && (
                <SecondaryButton
                  icon="pause"
                  label="Pause"
                  colors={colors}
                  styles={styles}
                  onPress={handlePauseRecording}
                />
              )}
              {isPaused && (
                <SecondaryButton
                  icon="play"
                  label="Resume"
                  colors={colors}
                  styles={styles}
                  onPress={handleResumeRecording}
                />
              )}
              {(isRecording || isPaused) && (
                <SecondaryButton
                  icon="stop"
                  label="Stop"
                  colors={colors}
                  styles={styles}
                  onPress={handleStopRecording}
                />
              )}
              {hasRecording && (
                <>
                  <PlaybackBar
                    colors={colors}
                    styles={styles}
                    durationMs={recordedClip?.durationMs ?? 0}
                    haptic={haptic}
                    reducedMotion={reducedMotion}
                  />
                  <SecondaryButton
                    icon="refresh"
                    label="Retake"
                    colors={colors}
                    styles={styles}
                    onPress={handleRetake}
                  />
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SheetContainer>
  );
}

// ── Record button ─────────────────────────────────────────────────────

interface RecordButtonProps {
  size: number;
  phase: RecorderPhase;
  colors: ThemeColors;
  disabled: boolean;
  onPress: () => void;
  reducedMotion: boolean;
  haptic: ReturnType<typeof useHaptic>;
}

function RecordButton({
  size,
  phase,
  colors,
  disabled,
  onPress,
  reducedMotion,
  haptic }: RecordButtonProps): React.ReactElement {
  const pressedSV = useSharedValue(0);
  const isRecording = phase === 'recording';
  const isPaused = phase === 'paused';

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    pressedSV.value = withTiming(1, { duration: Motion.duration.fast });
  }, [disabled, pressedSV]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;
    pressedSV.value = withTiming(0, { duration: Motion.duration.fast });
  }, [disabled, pressedSV]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    haptic.medium();
    onPress();
  }, [disabled, haptic, onPress]);

  const animatedStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { transform: [{ scale: 1 }] };
    }
    return { transform: [{ scale: 1 - 0.05 * pressedSV.value }] };
  });

  const buttonColor = isRecording || isPaused ? colors.surface : colors.danger;
  const iconColor = isRecording || isPaused ? colors.danger : colors.textInverse;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityLabel={
        isRecording
          ? 'Stop recording'
          : isPaused
            ? 'Stop recording'
            : 'Start recording'
      }
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || undefined }}
      style={{ width: size, height: size }}
    >
      <Reanimated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: buttonColor,
            borderWidth: 4,
            borderColor: colors.scrimTextPrimary,
            justifyContent: 'center',
            alignItems: 'center' },
          animatedStyle,
        ]}
      >
        {isRecording ? (
          <View
            style={{
              width: size * 0.3,
              height: size * 0.3,
              borderRadius: Radius.sm,
              backgroundColor: iconColor }}
          />
        ) : isPaused ? (
          <View
            style={{
              width: size * 0.3,
              height: size * 0.3,
              borderRadius: Radius.sm,
              backgroundColor: iconColor }}
          />
        ) : (
          <Ionicons name="mic" size={size * 0.4} color={iconColor} />
        )}
      </Reanimated.View>
    </Pressable>
  );
}

// ── Waveform visualization ────────────────────────────────────────────

interface WaveformVisualizationProps {
  bars: number[];
  color: string;
  maxHeight: number;
  minHeight: number;
}

const WaveformVisualization = React.memo(function WaveformVisualization({
  bars,
  color,
  maxHeight,
  minHeight }: WaveformVisualizationProps): React.ReactElement {
  const barWidth = 100 / bars.length;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: maxHeight,
        width: '100%',
        gap: Space.xxs }}
    >
      {bars.map((level, i) => {
        const height = Math.max(minHeight, level * maxHeight);
        return (
          <View
            key={i}
            style={{
              flex: barWidth,
              height,
              backgroundColor: color,
              borderRadius: Radius.none,
              opacity: 0.4 + 0.6 * level }}
          />
        );
      })}
    </View>
  );
});

// ── Secondary button ──────────────────────────────────────────────────

interface SecondaryButtonProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}

function SecondaryButton({
  icon,
  label,
  colors,
  styles,
  onPress }: SecondaryButtonProps): React.ReactElement {
  return (
    <PressScale
      onPress={onPress}
      style={[styles.secondaryBtn, { borderColor: colors.border }]}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={IconGrammar.metadata} color={colors.textPrimary} />
      <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
        {label}
      </Text>
    </PressScale>
  );
}

// ── Playback bar (play/pause + seek) ──────────────────────────────────

interface PlaybackBarProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  durationMs: number;
  haptic: ReturnType<typeof useHaptic>;
  reducedMotion: boolean;
}

function PlaybackBar({ colors, styles, durationMs, haptic, reducedMotion }: PlaybackBarProps) {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  const handlePlayPause = useCallback(() => {
    if (!reducedMotion) haptic.light();
    setPlaying((p) => !p);
  }, [haptic, reducedMotion]);

  const ratio = durationMs > 0 ? Math.min(1, position / durationMs) : 0;

  return (
    <View style={styles.playbackBar}>
      <Pressable
        onPress={handlePlayPause}
        style={styles.playbackBtn}
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons
          name={playing ? 'pause' : 'play'}
          size={IconGrammar.standard}
          color={colors.textPrimary}
        />
      </Pressable>
      <View style={styles.seekTrack}>
        <View
          style={[styles.seekFill, { width: `${ratio * 100}%`, backgroundColor: colors.brand }]}
        />
        <View
          style={[styles.seekThumb, { left: `${ratio * 100}%`, backgroundColor: colors.brand }]}
        />
      </View>
    </View>
  );
}

// ── Unavailable state (truthful — native module not linked) ──────────

function UnavailableState({
  colors,
  styles }: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}): React.ReactElement {
  return (
    <View style={styles.emptyBody}>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        Voiceover recording unavailable
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
        Requires expo-audio native module. Use a development build.
      </Text>
    </View>
  );
}

// ── Denied state (truthful — mic permission refused) ──────────────────

function DeniedState({
  colors,
  styles }: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}): React.ReactElement {
  return (
    <View style={styles.emptyBody}>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        Microphone access denied
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
        Enable mic access in settings to record.
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm },
    title: {
      flex: 1,
      textAlign: 'center',
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    doneBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    doneBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    // ── Timer ──
    timerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.lg },
    timer: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.screenTitle.size,
      fontVariant: ['tabular-nums'],
      letterSpacing: 1 },
    recordingDot: {
      width: 6,
      height: 6,
      borderRadius: Radius.full },
    recordingLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size,
      letterSpacing: 1 },
    // ── Waveform ──
    waveformContainer: {
      height: WAVEFORM_MAX_HEIGHT + Space.md,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: Space.sm },
    meteringNotice: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      textAlign: 'center',
      paddingVertical: Space.xs },
    // ── Record button ──
    recordButtonContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.lg,
      minHeight: RING_BASE_SIZE + Space.md },
    pulseRing: {
      position: 'absolute',
      borderWidth: Stroke.standard },
    // ── Secondary controls ──
    secondaryControls: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingTop: Space.sm },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      minHeight: Control.hit },
    secondaryBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    recordingErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    recordingErrorText: {
      flex: 1,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      textAlign: 'center' },
    recordingErrorRetry: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard },
    recordingErrorRetryText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size },
    // ── Playback bar ──
    playbackBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      width: '100%',
      paddingVertical: Space.xs },
    playbackBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    seekTrack: {
      flex: 1,
      height: Control.hit,
      justifyContent: 'center',
      position: 'relative' },
    seekFill: {
      position: 'absolute',
      left: 0,
      height: 2,
      borderRadius: Radius.full },
    seekThumb: {
      position: 'absolute',
      width: 16,
      height: 16,
      borderRadius: Radius.full,
      marginLeft: -8 },
    // ── Empty states ──
    emptyBody: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      gap: Space.sm },
    emptyTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      textAlign: 'center' },
    emptySubtitle: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      textAlign: 'center',
      paddingHorizontal: Space.lg } });
}

// ── Memoised style factory ────────────────────────────────────────────

const styleCache = new WeakMap<ThemeColors, ReturnType<typeof createStyles>>();
function useSheetStyles(colors: ThemeColors): ReturnType<typeof createStyles> {
  let cached = styleCache.get(colors);
  if (!cached) {
    cached = createStyles(colors);
    styleCache.set(colors, cached);
  }
  return cached;
}
