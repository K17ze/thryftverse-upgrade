import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';

export interface VoiceMessageRecorderProps {
  onSend?: (uri: string, durationMs: number) => void;
  onCancel?: () => void;
  onRecordingChange?: (isRecording: boolean) => void;
  disabled?: boolean;
}

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

const createIndicatorStyles = (colors: ThemeColors) =>
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
      fontSize: Type.bodyStrong.size,
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

/**
 * VoiceMessageRecorder — press-to-record voice message button.
 *
 * Uses expo-audio's useAudioRecorder hook for real audio recording.
 * Press the mic button to start recording; press again to stop and
 * send. The parent receives the recording URI and duration via onSend,
 * and can track recording state via onRecordingChange.
 *
 * When the native module is not available (e.g., Expo Go without a
 * development build), the button renders as a visibly disabled,
 * non-interactive control (AGENTS.md §11 — Truthful UI).
 */
export function VoiceMessageRecorder({
  onSend,
  onCancel,
  onRecordingChange,
  disabled = false,
}: VoiceMessageRecorderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // ── Native recorder (hook-managed lifecycle) ──────────────────────
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [isRecording, setIsRecording] = useState(false);
  const recordStartRef = useRef(0);

  // ── Check native module availability ──────────────────────────────
  const nativeAvailable = (() => {
    try {
      return AudioModule?.AudioRecorder != null;
    } catch {
      return false;
    }
  })();

  // ── Notify parent of recording state changes ──────────────────────
  useEffect(() => {
    onRecordingChange?.(isRecording);
  }, [isRecording, onRecordingChange]);

  // ── Recording actions ─────────────────────────────────────────────
  const handlePress = useCallback(async () => {
    if (disabled || !nativeAvailable) return;

    if (!isRecording) {
      // Start recording
      try {
        const { granted } = await AudioModule.requestRecordingPermissionsAsync();
        if (!granted) return;

        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
          interruptionMode: 'doNotMix',
        });

        await recorder.prepareToRecordAsync();
        recorder.record();
        recordStartRef.current = Date.now();
        setIsRecording(true);
      } catch {
        // Recording failed — reset state silently. The UI stays in
        // the idle state so the user can try again.
        setIsRecording(false);
      }
    } else {
      // Stop recording and send
      try {
        await recorder.stop();
        const uri = recorder.uri ?? '';
        const durationMs = Date.now() - recordStartRef.current;
        setIsRecording(false);
        if (uri) {
          onSend?.(uri, durationMs);
        }
      } catch {
        setIsRecording(false);
      }
    }
  }, [disabled, nativeAvailable, isRecording, recorder, onSend]);

  // ── Cancel recording (called by parent via onCancel) ──────────────
  useEffect(() => {
    if (onCancel && isRecording) {
      // The parent may trigger onCancel by unmounting or switching
      // state. We handle cleanup in the return callback below.
    }
  }, [onCancel, isRecording]);

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder, recorderState.isRecording]);

  // ── Disabled state (native module not available) ──────────────────
  if (!nativeAvailable) {
    return (
      <View
        style={styles.container}
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel="Voice messages are not available"
        accessibilityHint="Audio recording is not supported in this build"
      >
        <View style={styles.micBtn}>
          <Ionicons name="mic-off" size={22} color={colors.textMuted} />
        </View>
      </View>
    );
  }

  // ── Active recorder ───────────────────────────────────────────────
  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={isRecording ? 'Stop and send voice message' : 'Start voice message recording'}
      accessibilityHint={isRecording ? 'Tap to stop recording and send' : 'Tap and hold to record a voice message'}
      accessibilityState={{ disabled: disabled || undefined }}
      style={styles.container}
    >
      <View style={[styles.micBtn, isRecording && styles.micBtnRecording]}>
        <Ionicons
          name={isRecording ? 'stop' : 'mic'}
          size={22}
          color={isRecording ? colors.textInverse : colors.textPrimary}
        />
      </View>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
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
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    micBtnRecording: {
      backgroundColor: colors.danger,
    },
  });
