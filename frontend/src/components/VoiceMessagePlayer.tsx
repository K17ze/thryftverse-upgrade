import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

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
    const width = 200; // Approximate width of waveform area
    const progress = Math.min(Math.max(locationX / width, 0), 1);
    const seekTime = progress * duration;
    onSeek?.(seekTime);
  };

  const interpolatedColor = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['rgba(255,255,255,0.3)', 'rgba(255,255,255,1)'],
  });

  return (
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerThem, style]}>
      {/* Play/Pause Button */}
      <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
        <Ionicons
          name={localPlaying ? 'pause' : 'play'}
          size={24}
          color={isMe ? '#FFFFFF' : Colors.brand}
          style={!localPlaying && { marginLeft: 2 }}
        />
      </TouchableOpacity>

      {/* Waveform */}
      <TouchableOpacity style={styles.waveformContainer} onPress={handleWaveformPress} activeOpacity={0.8}>
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
                      ? (isMe ? '#FFFFFF' : Colors.brand)
                      : (isMe ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'),
                  },
                  localPlaying && isPlayed && styles.activeBar,
                ]}
              />
            );
          })}
        </View>
      </TouchableOpacity>

      {/* Duration */}
      <Text style={[styles.duration, isMe ? styles.durationMe : styles.durationThem]}>
        {formatTime(duration - currentTime)}
      </Text>

      {/* Speed Toggle */}
      <TouchableOpacity style={styles.speedButton} onPress={cycleSpeed}>
        <Text style={[styles.speedText, isMe ? styles.speedTextMe : styles.speedTextThem]}>
          {localSpeed}x
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 20,
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
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  waveformContainer: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    marginHorizontal: 8,
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
  activeBar: {
    // Add animation style for playing state
  },
  duration: {
    fontSize: 12,
    fontWeight: '500',
    minWidth: 35,
  },
  durationMe: {
    color: '#FFFFFF',
    opacity: 0.9,
  },
  durationThem: {
    color: Colors.textMuted,
  },
  speedButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 4,
  },
  speedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  speedTextMe: {
    color: '#FFFFFF',
  },
  speedTextThem: {
    color: Colors.brand,
  },
});
