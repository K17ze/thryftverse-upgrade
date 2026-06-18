import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { AnimatedPressable } from './AnimatedPressable';
import { Typography } from '../theme/designTokens';
import { Caption, Meta } from './ui/Text';

interface VoiceMessagePlayerProps {
  duration: number; // in seconds
  waveform: number[]; // 40 bars, normalized 0-1
  isMe?: boolean;
  isPlaying?: boolean;
  currentTime?: number;
  playbackSpeed?: 1 | 1.5 | 2;
  onPlayPause?: () => void;
  onSpeedChange?: (speed: 1 | 1.5 | 2) => void;
  onSeek?: (time: number) => void;
  style?: ViewStyle;
}

export function VoiceMessagePlayer({
  duration,
  waveform,
  isMe = false,
  isPlaying = false,
  currentTime = 0,
  playbackSpeed = 1,
  onPlayPause,
  onSpeedChange,
  onSeek,
  style,
}: VoiceMessagePlayerProps) {
  const [localPlaying, setLocalPlaying] = useState(isPlaying);
  const [localSpeed, setLocalSpeed] = useState<1 | 1.5 | 2>(playbackSpeed);
  const [waveformWidth, setWaveformWidth] = useState(200);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setLocalPlaying(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    const progress = (currentTime / duration) * 100;
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [currentTime, duration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    setLocalPlaying(!localPlaying);
    onPlayPause?.();
  };

  const cycleSpeed = () => {
    const speeds: (1 | 1.5 | 2)[] = [1, 1.5, 2];
    const currentIndex = speeds.indexOf(localSpeed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setLocalSpeed(nextSpeed);
    onSpeedChange?.(nextSpeed);
  };

  const handleWaveformPress = (event: any) => {
    const { locationX } = event.nativeEvent;
    const progress = Math.min(Math.max(locationX / waveformWidth, 0), 1);
    const seekTime = progress * duration;
    onSeek?.(seekTime);
  };

  const handleLayout = (event: any) => {
    setWaveformWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerThem, style]}>
      <AnimatedPressable
        style={styles.playButton}
        onPress={handlePlayPause}
        accessibilityRole="button"
        accessibilityLabel={localPlaying ? 'Pause voice message' : 'Play voice message'}
        activeOpacity={0.7}
        scaleValue={0.9}
        hapticFeedback="light"
      >
        <Ionicons
          name={localPlaying ? 'pause' : 'play'}
          size={24}
          color={isMe ? Colors.textInverse : Colors.brand}
          style={!localPlaying && { marginLeft: 2 }}
        />
      </AnimatedPressable>

      <AnimatedPressable
        style={styles.waveformContainer}
        onPress={handleWaveformPress}
        activeOpacity={0.8}
        onLayout={handleLayout}
      >
        <View style={styles.waveform}>
          {waveform.map((amplitude, index) => {
            const isPlayed = (index / waveform.length) <= (currentTime / duration);
            return (
              <Animated.View
                key={index}
                style={[
                  styles.waveformBar,
                  {
                    height: `${Math.max(amplitude * 100, 10)}%`,
                    backgroundColor: isPlayed
                      ? (isMe ? Colors.textInverse : Colors.brand)
                      : (isMe ? `${Colors.textInverse}30` : `${Colors.textMuted}30`),
                  },
                ]}
              />
            );
          })}
        </View>
      </AnimatedPressable>

      <Caption color={isMe ? Colors.textInverse : Colors.textMuted} style={styles.duration}>
        {formatTime(duration - currentTime)}
      </Caption>

      <AnimatedPressable
        style={styles.speedButton}
        onPress={cycleSpeed}
        accessibilityRole="button"
        accessibilityLabel={`Playback speed ${localSpeed}x`}
        activeOpacity={0.7}
        scaleValue={0.9}
        hapticFeedback="light"
      >
        <Meta color={isMe ? Colors.textInverse : Colors.brand} style={styles.speedText}>
          {localSpeed}x
        </Meta>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.sm + 2,
    borderRadius: Radius.xl + 4,
    minWidth: 240,
    maxWidth: 300,
  },
  containerMe: {
    backgroundColor: Colors.brand,
  },
  containerThem: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: `${Colors.textInverse}20`,
  },
  waveformContainer: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    marginHorizontal: Space.sm + 2,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 32,
    gap: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  duration: {
    minWidth: 35,
  },
  speedButton: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: `${Colors.textInverse}20`,
    marginLeft: Space.xs,
  },
  speedText: {
    fontFamily: Typography.family.bold,
  },
});