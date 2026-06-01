import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Radius } from '../../theme/designTokens';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';

interface AvatarRingProps {
  uri?: string;
  size?: number;
  isOnline?: boolean;
  isUnread?: boolean;
  ringWidth?: number;
}

export function AvatarRing({
  uri,
  size = 52,
  isOnline = false,
  isUnread = false,
  ringWidth = 2,
}: AvatarRingProps) {
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    if (isUnread) {
      pulse.value = withRepeat(
        withTiming(1, {
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      );
    }
  }, [isUnread, pulse]);

  const glowStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [1, 1.25]);
    const opacity = interpolate(pulse.value, [0, 1], [0.4, 0]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const ringColor = isUnread ? Colors.brand : 'transparent';
  const outerGlowSize = size + 8;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Unread glow behind avatar */}
      {isUnread && (
        <Reanimated.View
          style={[
            styles.glow,
            {
              width: outerGlowSize,
              height: outerGlowSize,
              borderRadius: outerGlowSize / 2,
              backgroundColor: Colors.brand,
            },
            glowStyle,
          ]}
          pointerEvents="none"
        />
      )}

      {/* Gold ring for unread */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: isUnread ? ringWidth : 0,
            borderColor: ringColor,
          },
        ]}
      >
        <CachedImage
          uri={uri ?? ''}
          style={{
            width: size - (isUnread ? ringWidth * 2 : 0),
            height: size - (isUnread ? ringWidth * 2 : 0),
            borderRadius: (size - (isUnread ? ringWidth * 2 : 0)) / 2,
          }}
          contentFit="cover"
        />
      </View>

      {/* Online dot */}
      {isOnline && (
        <View
          style={[
            styles.onlineDot,
            {
              width: 10,
              height: 10,
              borderRadius: 5,
              borderWidth: 2.5,
              bottom: 1,
              right: 1,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    alignSelf: 'center',
  },
  ring: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  onlineDot: {
    position: 'absolute',
    backgroundColor: Colors.success,
    borderColor: Colors.background,
  },
});
