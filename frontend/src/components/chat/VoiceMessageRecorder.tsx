import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
  useDerivedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useHaptic } from '../../hooks/useHaptic';
import { HapticPatterns } from '../../utils/hapticPatterns';
import { makeStableId } from '../../utils/createStableId';

export interface VoiceMessageRecorderProps {
  onSend: (uri: string, durationMs: number) => void;
  onCancel?: () => void;
  onRecordingChange?: (isRecording: boolean) => void;
  disabled?: boolean;
}

const CANCEL_THRESHOLD = 80;
const MIN_DURATION_MS = 800;
const BAR_COUNT = 5;
const BAR_MAX_HEIGHT = 28;
const BAR_MIN_HEIGHT = 6;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function WaveformBar({
  active,
  delay,
  color,
}: {
  active: boolean;
  delay: number;
  color: string;
}) {
  const { isEnabled } = useMotionConfig();
  const height = useSharedValue(BAR_MIN_HEIGHT);

  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => {
        height.value = withRepeat(
          withSequence(
            withTiming(BAR_MIN_HEIGHT + Math.random() * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT), {
              duration: isEnabled ? 280 : 0,
            }),
            withTiming(BAR_MIN_HEIGHT, { duration: isEnabled ? 280 : 0 }),
          ),
          -1,
          false,
        );
      }, delay);
      return () => clearTimeout(timer);
    }
    cancelAnimation(height);
    height.value = withTiming(BAR_MIN_HEIGHT, { duration: isEnabled ? 150 : 0 });
  }, [active, delay, isEnabled, height]);

  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <Reanimated.View style={[waveformStyles.bar, { backgroundColor: color }, animStyle]} />;
}

const waveformStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: BAR_MAX_HEIGHT,
  },
  bar: {
    width: 3,
    borderRadius: Radius.full,
  },
});

export function VoiceRecordingIndicator() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createIndicatorStyles(colors), [colors]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <View
      style={styles.container}
      accessibilityLabel={`Recording voice message, ${formatDuration(elapsedMs)} elapsed`}
    >
      <View style={styles.recDot} />
      <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>
      <View style={waveformStyles.row}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <WaveformBar key={i} active delay={i * 80} color={colors.textInverse} />
        ))}
      </View>
      <Text style={styles.hint} numberOfLines={1}>Slide left to cancel</Text>
    </View>
  );
}

const createIndicatorStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md - 2,
      paddingVertical: 6,
      minHeight: 44,
      borderRadius: Radius.xl,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    recDot: {
      width: 8,
      height: 8,
      borderRadius: Radius.full,
      backgroundColor: colors.danger,
    },
    timer: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    hint: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textMuted,
    },
  });

export function VoiceMessageRecorder({
  onSend,
  onCancel,
  onRecordingChange,
  disabled = false,
}: VoiceMessageRecorderProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const isRecording = useSharedValue(false);
  const dragX = useSharedValue(0);
  const micScale = useSharedValue(1);
  const startTimeRef = useRef(0);
  const sentRef = useRef(false);
  const recordingChangeRef = useRef(onRecordingChange);
  recordingChangeRef.current = onRecordingChange;

  const isCancelled = useDerivedValue(() => dragX.value <= -CANCEL_THRESHOLD);

  const notifyRecordingChange = useCallback((recording: boolean) => {
    recordingChangeRef.current?.(recording);
  }, []);

  const startRecording = useCallback(() => {
    if (disabled) return;
    isRecording.value = true;
    sentRef.current = false;
    startTimeRef.current = Date.now();
    dragX.value = 0;
    micScale.value = withSpring(1.12, spring.press);
    HapticPatterns.longPress();
    notifyRecordingChange(true);
  }, [disabled, isRecording, dragX, micScale, spring, notifyRecordingChange]);

  const finishRecording = useCallback(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    isRecording.value = false;
    micScale.value = withSpring(1, spring.press);
    dragX.value = 0;
    notifyRecordingChange(false);

    const duration = Date.now() - startTimeRef.current;
    haptic.success();

    if (duration < MIN_DURATION_MS) {
      onCancel?.();
      return;
    }

    const uri = `voice://${makeStableId('msg')}`;
    onSend(uri, duration);
  }, [isRecording, micScale, dragX, spring, haptic, onCancel, onSend, notifyRecordingChange]);

  const cancelRecording = useCallback(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    isRecording.value = false;
    micScale.value = withSpring(1, spring.press);
    dragX.value = 0;
    haptic.warning();
    notifyRecordingChange(false);
    onCancel?.();
  }, [isRecording, micScale, dragX, spring, haptic, onCancel, notifyRecordingChange]);

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onUpdate((e) => {
          if (e.translationX < 0) {
            dragX.value = e.translationX;
          }
        })
        .onEnd(() => {
          if (dragX.value <= -CANCEL_THRESHOLD) {
            cancelRecording();
          } else {
            dragX.value = withSpring(0, spring.press);
          }
        }),
    [dragX, cancelRecording, spring],
  );

  const pressGesture = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(180)
        .runOnJS(true)
        .onStart(() => {
          startRecording();
        })
        .onFinalize(() => {
          if (isRecording.value && !sentRef.current) {
            if (isCancelled.value) {
              cancelRecording();
            } else {
              finishRecording();
            }
          }
        }),
    [startRecording, finishRecording, cancelRecording, isRecording, isCancelled],
  );

  const composed = React.useMemo(
    () => Gesture.Race(panGesture, pressGesture),
    [panGesture, pressGesture],
  );

  const micAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View
        style={styles.container}
        accessibilityLabel="Hold to record voice message, slide left to cancel"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityHint="Press and hold to record, release to send, slide left to cancel"
      >
        <Reanimated.View style={[styles.micBtn, micAnimStyle]}>
          <Ionicons name="mic" size={24} color={colors.textInverse} />
        </Reanimated.View>
      </Reanimated.View>
    </GestureDetector>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.full,
    },
    micBtn: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
