import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';

interface PulseDotProps {
  size?: number;
  color?: string;
}

export function PulseDot({
  size = 8,
  color,
}: PulseDotProps) {
  const { colors } = useAppTheme();
  const resolvedColor = color ?? colors.brand;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: resolvedColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    position: 'absolute',
  },
});
