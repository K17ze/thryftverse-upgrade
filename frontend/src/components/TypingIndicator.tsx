import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  ViewStyle,
} from 'react-native';
import { Colors } from '../constants/colors';

interface TypingIndicatorProps {
  dotCount?: number;
  dotSize?: number;
  dotColor?: string;
  dotSpacing?: number;
  animationDuration?: number;
  style?: ViewStyle;
}

export function TypingIndicator({
  dotCount = 3,
  dotSize = 8,
  dotColor = Colors.textMuted,
  dotSpacing = 4,
  animationDuration = 600,
  style,
}: TypingIndicatorProps) {
  const animations = useRef(
    Array.from({ length: dotCount }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Create staggered animations for each dot
    const createAnimation = (index: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(animations[index], {
            toValue: 1,
            duration: animationDuration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(animations[index], {
            toValue: 0,
            duration: animationDuration / 2,
            useNativeDriver: true,
          }),
        ])
      );
    };

    // Start animations with stagger
    const animations_started = animations.map((_, index) => {
      const anim = createAnimation(index);
      // Add delay based on index
      setTimeout(() => {
        anim.start();
      }, index * (animationDuration / 3));
      return anim;
    });

    return () => {
      animations_started.forEach(anim => anim.stop());
    };
  }, []);

  return (
    <View style={StyleSheet.flatten([styles.container, style])}>
      {animations.map((anim, index) => {
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -8],
        });

        const scale = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.2],
        });

        const opacity = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.4, 1],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: dotColor,
                marginHorizontal: dotSpacing / 2,
                transform: [
                  { translateY },
                  { scale },
                ],
                opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

// Compact version for use inside message bubbles
export function CompactTypingIndicator({
  dotSize = 6,
  dotColor = '#FFFFFF',
  style,
}: Omit<TypingIndicatorProps, 'dotCount' | 'dotSpacing' | 'animationDuration'>) {
  return (
    <TypingIndicator
      dotCount={3}
      dotSize={dotSize}
      dotColor={dotColor}
      dotSpacing={3}
      animationDuration={500}
      style={StyleSheet.flatten([styles.compactContainer, style])}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    paddingHorizontal: 16,
  },
  dot: {
    // Base styles applied dynamically
  },
  compactContainer: {
    height: 20,
    paddingHorizontal: 8,
  },
});