import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useHaptic } from '../../hooks/useHaptic';

export interface VoiceMessageBubbleProps {
  durationMs: number;
  isMe: boolean;
  waveform?: number[];
  onPlay?: () => void;
  isPlaying?: boolean;
  progress?: number;
  accessibilityLabel?: string;
}

const DEFAULT_BAR_COUNT = 28;
const BAR_MAX_HEIGHT = 22;
const BAR_MIN_HEIGHT = 4;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function generateDefaultWaveform(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / count;
    return 0.3 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.5 + Math.random() * 0.2;
  });
}

function PlayingBar({
  heightFraction,
  color,
  isPlaying,
  delay,
}: {
  heightFraction: number;
  color: string;
  isPlaying: boolean;
  delay: number;
}) {
  const { isEnabled } = useMotionConfig();
  const height = useSharedValue(BAR_MIN_HEIGHT + heightFraction * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT));

  useEffect(() => {
    if (isPlaying) {
      const timer = setTimeout(() => {
        height.value = withRepeat(
          withSequence(
            withTiming(BAR_MIN_HEIGHT + Math.random() * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT), {
              duration: isEnabled ? 220 : 0,
            }),
            withTiming(BAR_MIN_HEIGHT + heightFraction * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT) * 0.5, {
              duration: isEnabled ? 220 : 0,
            }),
          ),
          -1,
          false,
        );
      }, delay);
      return () => clearTimeout(timer);
    }
    cancelAnimation(height);
    height.value = withTiming(
      BAR_MIN_HEIGHT + heightFraction * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT),
      { duration: isEnabled ? 150 : 0 },
    );
  }, [isPlaying, delay, isEnabled, height, heightFraction]);

  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <Reanimated.View style={[barStyles.bar, { backgroundColor: color }, animStyle]} />;
}

const barStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: BAR_MAX_HEIGHT,
    flex: 1,
  },
  bar: {
    flex: 1,
    borderRadius: Radius.full,
  },
});

export function VoiceMessageBubble({
  durationMs,
  isMe,
  waveform,
  onPlay,
  isPlaying = false,
  progress = 0,
  accessibilityLabel,
}: VoiceMessageBubbleProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors, isMe), [colors, isMe]);

  const bars = React.useMemo(
    () => (waveform && waveform.length > 0 ? waveform : generateDefaultWaveform(DEFAULT_BAR_COUNT)),
    [waveform],
  );

  const barColor = isMe ? `${colors.textInverse}80` : colors.textSecondary;
  const activeBarColor = isMe ? colors.textInverse : colors.brand;

  const handlePress = useCallback(() => {
    haptic.light();
    onPlay?.();
  }, [haptic, onPlay]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={
        accessibilityLabel ??
        `Voice message, ${formatDuration(durationMs)} long${isPlaying ? ', playing' : ''}`
      }
      accessibilityRole="button"
    >
      <View style={styles.playBtn}>
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={16}
          color={isMe ? colors.textInverse : colors.textPrimary}
        />
      </View>

      <View style={barStyles.row}>
        {bars.map((fraction, i) => {
          const isActive = isPlaying && i / bars.length <= progress;
          return (
            <PlayingBar
              key={i}
              heightFraction={fraction}
              color={isActive ? activeBarColor : barColor}
              isPlaying={isPlaying}
              delay={i * 30}
            />
          );
        })}
      </View>

      <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
    </Pressable>
  );
}

const createStyles = (colors: any, isMe: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minWidth: 180,
      maxWidth: 240,
      paddingVertical: 2,
    },
    playBtn: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      backgroundColor: isMe ? `${colors.textInverse}20` : colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    duration: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: isMe ? `${colors.textInverse}CC` : colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
  });
