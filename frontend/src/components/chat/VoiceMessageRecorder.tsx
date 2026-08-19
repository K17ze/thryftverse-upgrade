import React, { useEffect, useRef, useState } from 'react';
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
  cancelAnimation,
} from 'react-native-reanimated';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
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
 * VoiceMessageRecorder — honestly disabled.
 *
 * Real audio recording requires an expo-av integration that is not wired up
 * in this build. Per AGENTS.md §11 (Truthful UI) we never expose a control
 * that produces fake audio — so the mic renders as a visibly disabled,
 * non-interactive button instead of a working recorder that emits a
 * fabricated `voice://` URI.
 */
export function VoiceMessageRecorder(_props: VoiceMessageRecorderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.full,
      opacity: 0.5,
    },
    micBtn: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
