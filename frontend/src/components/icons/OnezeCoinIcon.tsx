import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';

interface OnezeCoinIconProps {
  size?: number;
}

export function OnezeCoinIcon({ size = 18 }: OnezeCoinIconProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const ringRadius = size / 2;
  const innerSize = Math.max(10, Math.round(size * 0.72));

  return (
    <LinearGradient
      colors={['#f4d27b', '#c68a2d']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.coin, { width: size, height: size, borderRadius: ringRadius }]}
    >
      <View style={[styles.inner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        <Text style={[styles.mark, { fontSize: Math.max(7, Math.round(size * 0.37)) }]}>1z</Text>
      </View>
    </LinearGradient>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  coin: {
    borderWidth: 1,
    borderColor: colors.bronze,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    borderWidth: 1,
    borderColor: colors.bronzeSubtle,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    color: colors.bronze,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});