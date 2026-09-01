import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { IconSize, type IconSizeKey } from '../../theme/iconTokens';

interface ThryftCartIconProps {
  size?: number | IconSizeKey;
  color?: string;
  focused?: boolean;
}

export function ThryftCartIcon({ size = IconSize.xs, color, focused }: ThryftCartIconProps) {
  const { colors } = useAppTheme();
  const resolvedColor = color ?? colors.textPrimary;
  const resolvedSize = typeof size === 'number' ? size : IconSize[size] ?? IconSize.xs;

  return (
    <View style={[styles.wrap, { width: resolvedSize, height: resolvedSize }]}>
      <Ionicons
        name={focused ? 'bag-handle' : 'bag-handle-outline'}
        size={resolvedSize}
        color={resolvedColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});